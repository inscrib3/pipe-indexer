import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UtxoController } from 'src/utxo/utxo.controller';
import { UtxoService } from 'src/utxo/utxo.service';
import { Utxo, UtxoSchema } from 'src/schemas/utxo';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Utxo.name, schema: UtxoSchema }]),
  ],
  controllers: [UtxoController],
  providers: [UtxoService],
})
export class UtxoModule {}
