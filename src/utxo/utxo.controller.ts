import { Controller, Get, Param, Query, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { UtxoService } from './utxo.service';
import { Pagination } from 'src/decorators/pagination';
import { MongooseClassSerializerInterceptor } from 'src/interceptors/mongoose';
import { PaginationInterceptor } from 'src/interceptors/pagination';
import { UtxoEntity } from 'src/entities/utxo';
import { LowercasePipe } from 'src/validation/lowercase';

@Controller('utxo')
@UseInterceptors(PaginationInterceptor)
@MongooseClassSerializerInterceptor(UtxoEntity)
@ApiTags('utxo')
export class UtxoController {
  constructor(private readonly utxoService: UtxoService) {}

  @ApiOperation({ summary: 'Get all recorded utxos' })
  @ApiResponse({
    status: 200,
    type: [UtxoEntity],
  })
  @Get('/')
  async getAll(@Pagination() pagination: any): Promise<UtxoEntity[]> {
    return await this.utxoService.getAll(pagination);
  }

  @ApiOperation({ summary: 'Get all utxos related to the given txId' })
  @ApiResponse({
    status: 200,
    type: [UtxoEntity],
  })
  @Get('/by-txid/:txid')
  async getByTxId(
    @Param('txid', LowercasePipe) txid: string,
    @Pagination() pagination: any,
  ): Promise<UtxoEntity[]> {
    return await this.utxoService.getByTxId(txid, pagination);
  }

  @ApiOperation({ summary: 'Get all utxos related to the given address' })
  @ApiResponse({
    status: 200,
    type: [UtxoEntity],
  })
  @Get('/by-address/:address')
  async getByAddress(
    @Param('address', LowercasePipe) address: string,
    @Pagination() pagination: any,
  ): Promise<UtxoEntity[]> {
    return await this.utxoService.getByAddress(address, pagination);
  }

  @ApiOperation({
    summary: 'Get all utxos related to the given address, ticker and id',
  })
  @ApiResponse({
    status: 200,
    type: [UtxoEntity],
  })
  @Get('/by-address/:address/:ticker/:id')
  async getByAddressTickerId(
    @Param('address', LowercasePipe) address: string,
    @Param('ticker', LowercasePipe) ticker: string,
    @Param('id') id: number,
    @Pagination() pagination: any,
  ): Promise<UtxoEntity[]> {
    return await this.utxoService.getByAddressTickerId(
      address,
      ticker,
      id,
      pagination,
    );
  }

  @ApiOperation({ summary: 'Get the utxo with the given txId and vout' })
  @ApiResponse({
    status: 200,
    type: UtxoEntity,
  })
  @Get('/get/:txid/:vout')
  async getByTxidVout(
    @Param('txid', LowercasePipe) txid: string,
    @Param('vout') vout: number,
  ): Promise<UtxoEntity> {
    return await this.utxoService.getByTxidVout(txid, vout);
  }

  @ApiOperation({
    summary: 'Get all utxos related to the given fields',
  })
  @ApiParam({
    name: 'params',
    type: String,
    format: '?params=txid1_vout1,txid2_vout2,...,txidN_voutN',
  })
  @ApiResponse({
    status: 200,
    type: [UtxoEntity],
  })
  @Get('/search')
  async search(@Query('params') params: string, @Pagination() pagination: any) {
    return await this.utxoService.searchUtxos(params, pagination);
  }
}
