import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type UtxoDocument = HydratedDocument<Utxo>;

@Schema({
  timestamps: { createdAt: true, updatedAt: false },
})
export class Utxo {
  @Prop({ required: true, index: true })
  address: string;

  @Prop({ required: true, index: true })
  txId: string;

  @Prop({ required: true })
  vout: number;

  @Prop({ required: true })
  amount: string;

  @Prop({ required: true })
  decimals: number;

  @Prop({ required: true })
  ticker: string;

  @Prop({ required: true })
  id: number;

  @Prop({ required: true, index: true })
  block: number;
}

export const UtxoSchema = SchemaFactory.createForClass(Utxo);
