import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { UtxoEntity } from 'src/entities/utxo';
import { Utxo } from 'src/schemas/utxo';
import { findWithTotalCount } from 'src/utils/helpers';

@Injectable()
export class UtxoService {
  private readonly logger: Logger;

  constructor(@InjectModel(Utxo.name) private utxoModel: Model<Utxo>) {
    this.logger = new Logger(UtxoService.name);
  }

  async getAll(pagination = null): Promise<UtxoEntity[]> {
    const utxos = await findWithTotalCount(this.utxoModel, {}, pagination);
    return utxos;
  }

  async getByToken(
    ticker: string,
    id: number,
    pagination = null,
  ): Promise<UtxoEntity[]> {
    const utxos = await findWithTotalCount(
      this.utxoModel,
      { ticker, id },
      pagination,
    );
    return utxos;
  }

  async getByTxId(txid: string, pagination = null): Promise<UtxoEntity[]> {
    const utxos = await findWithTotalCount(
      this.utxoModel,
      { txId: txid },
      pagination,
    );
    return utxos;
  }

  async getByAddress(
    address: string,
    pagination = null,
  ): Promise<UtxoEntity[]> {
    const utxos = await findWithTotalCount(
      this.utxoModel,
      { address },
      pagination,
    );
    return utxos;
  }

  async getByAddressTickerId(
    address: string,
    ticker: string,
    id: number,
    pagination = null,
  ): Promise<UtxoEntity[]> {
    const utxos = await findWithTotalCount(
      this.utxoModel,
      { address, ticker, id },
      pagination,
    );
    return utxos;
  }

  async getByTxidVout(txid: string, vout: number): Promise<UtxoEntity> {
    const utxo: any = await this.utxoModel.findOne({ txId: txid, vout }).exec();
    if (utxo) return utxo;
    else throw new NotFoundException({ error: 'utxo not found' });
  }

  async searchUtxos(params: string, pagination = null): Promise<UtxoEntity[]> {
    const pairs = params.split(',');

    const queryConditions = pairs.map((pair) => {
      const [txId, voutStr] = pair.split('_');

      if (!txId || isNaN(+voutStr)) {
        throw new BadRequestException({
          error: 'invalid txId or vout in params',
        });
      }

      const vout = parseInt(voutStr, 10);
      return { txId, vout };
    });

    const utxos: any = await this.utxoModel
      .find({ $or: queryConditions }, null, pagination)
      .exec();
    return utxos;
  }
}
