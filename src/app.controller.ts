import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppService } from './app.service';

@Controller()
@UseInterceptors(FileInterceptor('file'))
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: 'Return server status' })
  @ApiResponse({
    status: 200,
    type: String,
  })
  @Get()
  index() {
    return { message: 'ok', time: new Date().toISOString() };
  }
}
