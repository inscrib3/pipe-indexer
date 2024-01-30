import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type TokenDocument = HydratedDocument<Token>;

@Schema({ timestamps: true })
export class Token {
  @Prop({ required: false })
  pid: number;

  @Prop({ required: false })
  beneficiaryAddress: string;

  @Prop({ required: true, index: true })
  ticker: string;

  @Prop({ required: true, index: true })
  id: number;

  @Prop({ required: true })
  decimals: number;

  @Prop({ required: true })
  maxSupply: string;

  @Prop({ required: true })
  limit: number;

  @Prop({
    required: true,
    default: function () {
      return this.maxSupply;
    },
  })
  remaining: string;

  @Prop({ required: false })
  mime?: string;

  @Prop({ required: false })
  metadata?: string;

  @Prop({ required: false })
  ref?: string;

  @Prop({ required: false })
  traits?: string[];

  @Prop({ required: false })
  collectionNumber?: number;

  @Prop({ required: false })
  collectionAddress?: string;

  @Prop({ required: true })
  txId: string;

  @Prop({ required: true, index: true })
  block: number;

  @Prop({ required: true })
  bvo: number;

  @Prop({ required: true })
  vo: number;
}

export const TokenSchema = SchemaFactory.createForClass(Token);
