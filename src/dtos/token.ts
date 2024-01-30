import { IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { NumberOption, StringOption } from 'necord';

export class TokenDto {
  @IsNotEmpty()
  @IsString()
  @StringOption({
    name: 'ticker',
    description: 'Token text ticker',
    required: true,
  })
  ticker: string;

  @IsNumber()
  @NumberOption({
    name: 'id',
    description: 'Token numeric ID',
    required: true,
  })
  id: number;
}
