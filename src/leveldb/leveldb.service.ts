import { Inject, Injectable } from '@nestjs/common';
import { Level } from 'level';

@Injectable()
export class LevelDBService {
  constructor(@Inject('LEVELDB_CONNECTION') private db: Level) {}

  async get(key: string) {
    return await this.db.get(key);
  }

  async put(key: string, value: any) {
    return await this.db.put(key, value);
  }

  async del(key: string) {
    return await this.db.del(key);
  }

  async close() {
    await this.db.close();
  }

  iterator() {
    return this.db.iterator();
  }
}
