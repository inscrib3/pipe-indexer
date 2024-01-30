import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Indexer, IndexerErrors } from 'src/utils/indexer';
import { LevelDBService } from 'src/leveldb/leveldb.service';
import { IndexerService } from './indexer.service';

@Injectable()
export class IndexScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IndexScheduler.name);
  private indexer;
  private runningIndexing;
  private runningAnalyser;

  constructor(
    private readonly leveldbService: LevelDBService,
    private indexerService: IndexerService,
    private configService: ConfigService,
  ) {
    this.indexer = new Indexer(
      this.configService.get<string>('BITCOIN_NODE_URL') || '',
      leveldbService,
      indexerService,
    );

    this.runningIndexing = false;
    this.runningAnalyser = false;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleIndexing() {
    if (this.runningIndexing) return;

    this.runningIndexing = true;

    if (await this.indexer.mustIndex()) {
      const res = await this.indexer.index();

      if (res == IndexerErrors.REORG) {
        await this.indexer.cleanup();
      } else if (res == IndexerErrors.BLOCK_AREADY_ANALYSED) {
        await this.indexer.fixBlock();
      }
    }

    this.runningIndexing = false;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleAnalysing() {
    if (this.runningAnalyser) return;

    this.runningAnalyser = true;

    const tokens = await this.indexerService.getAll();
    for (const token of tokens) {
      try {
        const data = await this.leveldbService.get(
          'd_' + token.ticker + '_' + token.id,
        );
        const ddd = JSON.parse(data);
        const deployment = JSON.parse(ddd.value);
        if (deployment.rem !== token.remaining) {
          this.logger.warn(
            'Mismatch on remaining amount for token ' +
              token.ticker +
              ':' +
              token.id,
          );
          await this.indexerService.updateRemaining(
            token.ticker,
            token.id,
            deployment.rem,
          );
        }
      } catch (e) {
        this.logger.error(
          'Token ' + token.ticker + ':' + token.id + ' not found on leveldb',
        );
      }
    }

    this.runningAnalyser = false;
  }

  async onModuleInit() {
    await this.indexer.init();
    this.logger.log('Scheduler started');
  }

  async onModuleDestroy() {
    await this.indexer.close();
    this.logger.log('Scheduler stopped');
  }
}
