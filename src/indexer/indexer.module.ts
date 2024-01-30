import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { IndexerService } from './indexer.service';
import { IndexScheduler } from './indexer.scheduler';
import { UtxoService } from 'src/utxo/utxo.service';
import { TokenService } from 'src/token/token.service';
import { Token, TokenSchema } from 'src/schemas/token';
import { Utxo, UtxoSchema } from 'src/schemas/utxo';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Token.name, schema: TokenSchema },
      { name: Utxo.name, schema: UtxoSchema },
    ]),
  ],
  providers: [IndexerService, TokenService, UtxoService, IndexScheduler],
})
export class IndexerModule {}
