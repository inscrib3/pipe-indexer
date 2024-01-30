import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Token } from 'src/schemas/token';
import { Utxo } from 'src/schemas/utxo';

@Injectable()
export class IndexerService implements OnModuleInit {
  private readonly logger: Logger;
  private pid: number;
  private supported_mimes = [
    'application/json',
    'application/pdf',
    'application/pgp-signature',
    'application/protobuf',
    'application/yaml',
    'audio/flac',
    'audio/mpeg',
    'audio/wav',
    'image/apng',
    'image/avif',
    'image/gif',
    'image/jpeg',
    'image/png',
    'image/svg+xml',
    'image/webp',
    'model/gltf+json',
    'model/gltf-binary',
    'model/stl',
    'text/css',
    'text/html',
    'text/html;charset=utf-8',
    'text/javascript',
    'text/markdown',
    'text/markdown;charset=utf-8',
    'text/plain',
    'text/plain;charset=utf-8',
    'video/mp4',
    'video/webm',
  ];

  constructor(
    @InjectModel(Token.name) private tokenModel: Model<Token>,
    @InjectModel(Utxo.name) private utxoModel: Model<Utxo>,
  ) {
    this.logger = new Logger(IndexerService.name);
  }

  async onModuleInit() {
    const records = await this.tokenModel.countDocuments().exec();
    if (records === 1) this.pid = 0;
    else this.pid = records;
  }

  async getAll() {
    return await this.tokenModel.find().exec();
  }

  async updateRemaining(ticker: string, id: number, remaining: string) {
    try {
      const token = await this.tokenModel.findOne({ ticker, id }).exec();
      if (token) {
        token.remaining = remaining;
        await token.save();
      } else {
        this.logger.error(`Token ${ticker}:${id} not found`);
      }
    } catch (e) {
      this.logger.error(
        `Error occurred during update of token ${ticker}:${id}`,
      );
      this.logger.error(e);
    }
  }

  async saveToken(tokenData: any) {
    try {
      const existingToken = await this.tokenModel
        .findOne({ ticker: tokenData.ticker, id: tokenData.id })
        .exec();

      if (existingToken) {
        await this.updateRemaining(
          tokenData.ticker,
          tokenData.id,
          tokenData.remaining,
        );
        await existingToken.save();
      } else {
        if (tokenData.mime && !this.supported_mimes.includes(tokenData.mime)) {
          this.logger.error(
            `Unsupported mime type ${tokenData.mime} for token ${tokenData.ticker}:${tokenData.id}`,
          );
        }
        tokenData.pid = this.pid;
        const newToken = new this.tokenModel(tokenData);
        await newToken.save();
        this.pid += 1;
      }
    } catch (e) {
      this.logger.error(
        `Error occurred during save or update of token ${tokenData.ticker}:${tokenData.id}`,
      );
      this.logger.error(e);
    }
  }

  async addUtxo(data: any, block: number) {
    try {
      const token = await this.tokenModel
        .findOne({ ticker: data.tick, id: data.id })
        .exec();
      if (token) {
        const utxo: Utxo = {
          address: data.addr,
          txId: data.txid,
          vout: data.vout,
          amount: data.amt,
          decimals: token.decimals,
          ticker: data.tick,
          id: data.id,
          block: block,
        };
        const newUtxo = new this.utxoModel(utxo);
        await newUtxo.save();
      } else {
        this.logger.error(`Token ${data.tick}:${data.id} not found`);
      }
    } catch (e) {
      this.logger.error(`Error occurred when saving new utxo ${data.txid}`);
      this.logger.error(e);
    }
  }

  async deleteUtxo(txId: string, vout: number) {
    try {
      const utxo = await this.utxoModel.findOneAndDelete({ txId, vout }).exec();
      if (!utxo) {
        this.logger.error(`UTXO with txId ${txId} and vout ${vout} not found.`);
      }
    } catch (e) {
      this.logger.error(
        `Error occurred when deleting UTXO with txId ${txId} and vout ${vout}.`,
      );
      this.logger.error(e);
    }
  }

  async removeAllRecordsByBlock(block: number) {
    try {
      await this.tokenModel.deleteMany({ block }).exec();
      await this.utxoModel.deleteMany({ block }).exec();
      this.pid = await this.tokenModel.countDocuments().exec();
    } catch (e) {
      this.logger.error(
        `Error occurred when removing tokens for block ${block}`,
      );
      this.logger.error(e);
    }
  }
}
