import {
  PipeTransform,
  Injectable,
  ArgumentMetadata,
  BadRequestException,
} from '@nestjs/common';

@Injectable()
export class LowercasePipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    if (value == null) {
      throw new BadRequestException({
        error: `${metadata.data} is required`,
      });
    }

    if (!/^[a-z0-9]+$/i.test(value)) {
      throw new BadRequestException({
        error: `${metadata.data} must be alphanumeric`,
      });
    }

    if (typeof value === 'string') {
      return value.toLowerCase();
    } else {
      throw new BadRequestException({
        error: `${metadata.data} must be a string`,
      });
    }
  }
}
