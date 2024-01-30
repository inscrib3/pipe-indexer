import { Injectable, Logger } from '@nestjs/common';
import { Address, Networks, Script } from '@cmdcode/tapscript';
import { RPC } from 'src/utils/rpc';
import {
  cleanFloat,
  countDecimals,
  formatNumberString,
  hexToBytes,
  hexToString,
  resolveNumberString,
  sleep,
  toString26,
} from './helpers';
import { LevelDBAdapter } from 'src/leveldb/leveldb.adapter';
import { LevelDBService } from 'src/leveldb/leveldb.service';
import { IndexerService } from 'src/indexer/indexer.service';
import * as bitcoin from 'bitcoinjs-lib';

type SpentTokenCount = {
  [key: string]: bigint;
};

export const enum IndexerErrors {
  BLOCK_AREADY_ANALYSED,
  REORG,
  OK,
}

@Injectable()
export class Indexer {
  private readonly logger: Logger;
  private network: Networks;
  private rpc;
  private db;
  private legacy_block_end = 810000;
  private total_limit = 18446744073709551615n;
  private block = 809607;

  private op_table: any = {
    p: '50',
    d: '44',
    m: '4d',
    a: '41',
    i: '49',
    r: '52',
    n: '4e',
    tr: '5452',
    t: '54',
    b: '42',
    i_OP_0: 0,
    i_OP_FALSE: 0,
    i_OP_1: 1,
    i_OP_TRUE: 1,
    i_OP_2: 2,
    i_OP_3: 3,
    i_OP_4: 4,
    i_OP_5: 5,
    i_OP_6: 6,
    i_OP_7: 7,
    i_OP_8: 8,
    i_OP_9: 9,
    i_OP_10: 10,
    i_OP_11: 11,
    i_OP_12: 12,
    i_OP_13: 13,
    i_OP_14: 14,
    i_OP_15: 15,
    i_OP_16: 16,
  };

  // might become handy later w/ explorer feature
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
    url: string,
    dbInstance: LevelDBService,
    indexerService: IndexerService,
    network: Networks = 'main',
  ) {
    this.logger = new Logger(Indexer.name);
    this.rpc = new RPC(url, this.logger);

    this.network = network;
    this.db = new LevelDBAdapter(dbInstance, indexerService);
  }

  async init() {
    try {
      this.logger.log('Indexer started');
      this.block = (await this.db.get('b')) + 1;
    } catch {}
  }

  async close() {
    while (true) {
      try {
        await this.db.get('mrk');
      } catch (e) {
        await this.db.close();
        this.logger.log('Indexer stopped');
        return;
      }
      await sleep(100);
    }
  }

  async cleanup() {
    const toBlock = this.block;
    const fromBlock = toBlock - 8;
    this.logger.debug('Cleaning up from block ' + fromBlock + ' to ' + toBlock);
    for (let block = fromBlock; block <= toBlock; block++) {
      this.db.removeAll(block);
    }

    this.block = fromBlock;
    await this.db.put('bchk', fromBlock);
  }

  async getChainBlock() {
    try {
      const info = await this.rpc.call('getblockchaininfo', []);
      return info.blocks;
    } catch (e) {}

    return 0;
  }

  /**
   * Returns the current max. number for a collectible
   *
   * @param address
   * @returns {Promise<any|null>}
   */
  async getCollectibleMax(address: string) {
    try {
      return JSON.parse(await this.db.get('c_max_' + address));
    } catch (e) {}

    return null;
  }

  /**
   * Returns the collectible information, if any (PIPE | Art)
   *
   * @param address
   * @param num
   * @returns {Promise<any|null>}
   */
  async getCollectible(address: string, num: number) {
    try {
      return JSON.parse(await this.db.get('c_' + address + '_' + num));
    } catch (e) {}

    return null;
  }

  /**
   * Returns the deployment data of a selected set of ticker and id.
   *
   * @param ticker
   * @param id
   * @returns {Promise<any|null>}
   */
  async getDeployment(ticker: string, id: number) {
    try {
      return JSON.parse(
        await this.db.get('d_' + ticker.toLowerCase() + '_' + id),
      );
    } catch (e) {}

    return null;
  }

  /**
   * Returns an address (utxo) based token balance.
   *
   * @param address
   * @param ticker
   * @param id
   * @returns {Promise<{ticker, amt_big: string, decimals: *, amt, id}|null>}
   */
  async getBalance(address: string, ticker: string, id: number) {
    try {
      const deployment = await this.getDeployment(ticker, id);
      if (deployment !== null) {
        const address_amt =
          'a_' + address + '_' + ticker.toLowerCase() + '_' + id;
        const amt = BigInt(await this.db.get(address_amt));
        return {
          ticker: deployment.tick,
          id: deployment.id,
          decimals: deployment.dec,
          amt_big: amt.toString(),
          amt: cleanFloat(formatNumberString(amt.toString(), deployment.dec)),
        };
      }
    } catch (e) {}

    return null;
  }

  async fixBlock() {
    const chain_block = await this.getChainBlock();

    if (chain_block > this.block) {
      this.block += 1;
    }
  }

  async mustIndex() {
    const chain_block = await this.getChainBlock();

    if (chain_block > this.block) {
      return true;
    }

    return false;
  }

  /**
   * Main indexing function.
   * Calls DMT functions, depending on the op_return status.
   *
   * @param block
   * @returns {Promise<void>}
   */
  async index() {
    const transactionToJson = (tx: bitcoin.Transaction) => {
      const inputs = tx.ins.map((input) => ({
        txid: Buffer.from(input.hash).reverse().toString('hex'),
        vout: input.index,
        scriptPubKey: input.script.toString('hex'),
        sequence: input.sequence,
        witness: input.witness,
      }));

      const outputs = tx.outs.map((output) => ({
        value: output.value,
        scriptPubKey: output.script.toString('hex'),
      }));

      return {
        txid: tx.getId(),
        version: tx.version,
        locktime: tx.locktime,
        vin: inputs,
        vout: outputs,
      };
    };

    this.db.setBlock(this.block);

    try {
      try {
        const block_check = await this.db.get('bchk');

        if (block_check >= this.block) {
          this.logger.warn('Block already analysed');
          return IndexerErrors.BLOCK_AREADY_ANALYSED;
        }
      } catch (e) {}

      try {
        console.log(await this.db.get('reorg'));
        this.logger.warn('Reorg detected at block ' + (this.block - 1));
        return IndexerErrors.REORG;
      } catch (e) {}

      if (this.block > 0) {
        let prev_blockhash = await this.rpc.call('getblockhash', [
          this.block - 1,
        ]);
        prev_blockhash = prev_blockhash.trim();

        try {
          const prev_recorded_blockhash = await this.db.get('bh');

          if (prev_blockhash !== prev_recorded_blockhash) {
            await this.db.put('reorg', '');
          }
        } catch (e) {}
      }

      this.logger.debug(`Start indexing block ${this.block}`);

      const blockhash = await this.rpc.call('getblockhash', [this.block]);
      const tx = await this.rpc.call('getblock', [blockhash, 3]);

      await this.db.put('mrk', '');
      await this.db.put('bchk', this.block);

      for (let i = 0; i < tx.tx.length; i++) {
        try {
          const hex = tx.tx[i].hex;
          const res = transactionToJson(bitcoin.Transaction.fromHex(hex));

          let op_return_vout = -1;
          let op_return_count = 0;
          let decoded = null;

          for (let j = 0; j < res.vout.length; j++) {
            decoded = Script.decode(res.vout[j].scriptPubKey, false);

            if (decoded.length > 0 && decoded[0] === 'OP_RETURN') {
              op_return_vout = j;
              op_return_count += 1;
            }
          }

          const spent_token_count: SpentTokenCount = {};
          let the_sig = '';

          for (let j = 0; j < res.vin.length; j++) {
            const utxo = 'utxo_' + res.vin[j].txid + '_' + res.vin[j].vout;

            try {
              const _utxo = await this.db.get(utxo);
              const old_utxo = JSON.parse(_utxo);

              const address_amt =
                'a_' + old_utxo.addr + '_' + old_utxo.tick + '_' + old_utxo.id;

              try {
                let amt = BigInt(await this.db.get(address_amt));
                old_utxo.amt = BigInt(old_utxo.amt);
                amt -= old_utxo.amt;
                if (amt < 0n) {
                  amt = 0n;
                }
                await this.db.put(address_amt, amt.toString());
                await this.db.put('spent_' + utxo, _utxo);
                await this.db.del(utxo);

                // in case needed later on to assign non-op_return transactions
                const sig = old_utxo.tick + '_' + old_utxo.id;

                if (the_sig === '') {
                  the_sig = sig;
                }

                if (sig === the_sig) {
                  if (typeof spent_token_count[sig] === 'undefined') {
                    spent_token_count[sig] = 0n;
                  }

                  spent_token_count[sig] += BigInt(old_utxo.amt);
                }
              } catch (e) {}
            } catch (e) {}
          }

          try {
            decoded = Script.decode(
              res.vout[op_return_vout].scriptPubKey,
              false,
            );
          } catch (e) {}

          if (
            decoded !== null &&
            decoded.length > 2 &&
            decoded[0] === 'OP_RETURN' &&
            decoded[1] === this.op_table.p
          ) {
            if (op_return_count !== 1) continue;
            if (res.vout.length < 2) continue;

            switch (decoded[2]) {
              case this.op_table.d:
                await this.indexDeployment(
                  this.block,
                  blockhash,
                  op_return_vout,
                  tx.tx[i],
                  res,
                  decoded,
                );
                break;
              case this.op_table.m:
                await this.indexMint(
                  this.block,
                  blockhash,
                  op_return_vout,
                  tx.tx[i],
                  res,
                  decoded,
                );
                break;
              case this.op_table.t:
                await this.indexTransfer(
                  this.block,
                  blockhash,
                  op_return_vout,
                  tx.tx[i],
                  res,
                  decoded,
                );
                break;
            }
          } else {
            // in case no valid op_return was given but utxos contained tokens,
            // we try to associate all tokens of the first token type found (ticker:id)
            // of all inputs with the first output, that is not an op_return.
            // all other token types in inputs must be skipped.

            // there is only 1 sig, it's just a bit more convenient that way
            for (const sig in spent_token_count) {
              // we only loop to find potential op_returns.
              // as soon as the first addressable output is found, we associate the tokens and break from the loop.
              for (let j = 0; j < res.vout.length; j++) {
                decoded = Script.decode(res.vout[j].scriptPubKey, false);

                if (decoded[0] !== 'OP_RETURN') {
                  try {
                    const to_address = Address.fromScriptPubKey(
                      res.vout[j].scriptPubKey,
                      this.network,
                    );
                    const utxo = 'utxo_' + tx.tx[i].txid + '_' + j;
                    const address_amt = 'a_' + to_address + '_' + sig;

                    const pair = sig.split('_');
                    const deployment = await this.getDeployment(
                      pair[0],
                      parseInt(pair[1]),
                    );

                    if (deployment === null) {
                      continue;
                    }

                    const _utxo = {
                      addr: to_address,
                      txid: tx.tx[i].txid,
                      vout: j,
                      tick: deployment?.tick,
                      id: deployment?.id,
                      amt: spent_token_count[sig].toString(),
                    };

                    try {
                      let amt = await this.db.get(address_amt);
                      amt = BigInt(amt) + spent_token_count[sig];
                      await this.db.put(address_amt, amt.toString());
                      await this.db.put(utxo, JSON.stringify(_utxo));
                    } catch (e) {
                      await this.db.put(
                        address_amt,
                        spent_token_count[sig].toString(),
                      );
                      await this.db.put(utxo, JSON.stringify(_utxo));
                    }

                    break;
                  } catch (e) {}
                }
              }

              break;
            }
          }
        } catch (e) {}
      }

      await this.db.put('b', this.block);
      await this.db.put('bh', blockhash);
      await this.db.del('mrk');
    } catch (e) {}

    this.logger.debug(`Done indexing block ${this.block}`);

    if (await this.mustIndex()) {
      await sleep(1000);
      this.block += 1;
      await this.index();
    }

    return IndexerErrors.OK;
  }

  /**
   * Transfer function to associate tokens based on the op_return data.
   * Creates 4 outputs: 0 = recipient, 1 = token change, 2 = op_return, 3 = sats change
   *
   * @param block
   * @param blockhash
   * @param vout
   * @param tx
   * @param res
   * @param ops
   * @returns {Promise<void>}
   */
  async indexTransfer(
    block: number,
    blockhash: string,
    vout: any,
    tx: any,
    res: any,
    ops: string[],
  ) {
    // op count must be uneven
    if (ops.length % 2 === 0) return;

    // must at least include a full quadruple
    if (ops.length < 7) return;

    // let's check for the amount of quadruples we got
    const tuples_length = ops.length - 3;

    // check for potential presence of all quadruples
    if (tuples_length % 4 !== 0) return;

    let utxos: any = [];
    const outputs: any = [];

    for (let i = 3; i < ops.length; i += 4) {
      const hex = ops[i];
      const base = 10;
      const bn = BigInt('0x' + hex);
      const int_ticker = BigInt(bn.toString(base));

      const ticker = toString26(int_ticker);
      if (ticker === '') return;

      const id =
        ops[i + 1].startsWith('OP_') &&
        typeof this.op_table[
          ('i_' + ops[i + 1]) as keyof typeof this.op_table
        ] !== 'undefined'
          ? this.op_table[('i_' + ops[i + 1]) as keyof typeof this.op_table]
          : parseInt(ops[i + 1], 16);
      if (isNaN(id) || id < 0 || id > 999999) return;

      const output =
        ops[i + 2].startsWith('OP_') &&
        typeof this.op_table[
          ('i_' + ops[i + 2]) as keyof typeof this.op_table
        ] !== 'undefined'
          ? this.op_table[('i_' + ops[i + 2]) as keyof typeof this.op_table]
          : parseInt(ops[i + 2], 16);
      if (isNaN(output) || output < 0) return;

      let transfer;

      if (block < this.legacy_block_end) {
        if (isNaN(parseInt(hexToString(ops[i + 3])))) {
          transfer = ops[i + 3];
        } else {
          transfer = hexToString(ops[i + 3]);
        }
      } else {
        transfer = hexToString(ops[i + 3]);
      }

      if (transfer.startsWith('0') && !transfer.startsWith('0.')) return;
      if (transfer.includes('.') && transfer.endsWith('0')) return;
      if (transfer.endsWith('.')) return;

      const deployment = await this.getDeployment(ticker, id);

      if (deployment !== null) {
        if (countDecimals(transfer) > deployment.dec) return;

        transfer = resolveNumberString(transfer, deployment.dec);

        const _total_limit = this.total_limit;
        const _transfer = BigInt(transfer);

        if (_transfer <= 0 || _transfer > _total_limit) return;

        if (typeof res.vout[output] === 'undefined') return;
        const res_vout = Script.decode(res.vout[output].scriptPubKey, false);
        if (res_vout[0] === 'OP_RETURN') return;

        try {
          const to_address = Address.fromScriptPubKey(
            res.vout[output].scriptPubKey,
            this.network,
          );

          const _utxo = {
            addr: to_address,
            txid: tx.txid,
            vout: output,
            tick: deployment.tick,
            id: deployment.id,
            amt: _transfer.toString(),
          };

          // outputs can only be used once or the transfer is invalid and tokens are lost
          if (outputs.includes(output)) {
            utxos = [];
            break;
          }

          utxos.push(_utxo);
          outputs.push(output);

          //console.log('1st push', _utxo);
        } catch (e) {
          this.logger.error(e);
        }
      }
    }

    if (utxos.length > 0) {
      const token_count: SpentTokenCount = {};
      const spent_token_count: SpentTokenCount = {};

      for (let i = 0; i < res.vin.length; i++) {
        try {
          let spent_utxo = await this.db.get(
            'spent_utxo_' + res.vin[i].txid + '_' + res.vin[i].vout,
          );
          spent_utxo = JSON.parse(spent_utxo);

          const sig = spent_utxo.tick + '-' + spent_utxo.id;

          if (typeof spent_token_count[sig] === 'undefined') {
            spent_token_count[sig] = 0n;
          }

          spent_token_count[sig] += BigInt(spent_utxo.amt);
        } catch (e) {}
      }

      for (let i = 0; i < utxos.length; i++) {
        const sig = utxos[i].tick + '-' + utxos[i].id;

        if (typeof token_count[sig] === 'undefined') {
          token_count[sig] = 0n;
        }

        token_count[sig] += BigInt(utxos[i].amt);
      }

      for (const sig in spent_token_count) {
        if (typeof token_count[sig] !== 'undefined') {
          if (spent_token_count[sig] < token_count[sig]) {
            // token count cannot exceed the spent count.
            // invalid transfer.
            return;
          }
        }
      }

      //console.log('2nd push', spent_token_count, token_count);

      for (let i = 0; i < utxos.length; i++) {
        const sig = utxos[i].tick + '-' + utxos[i].id;

        if (
          typeof spent_token_count[sig] === 'undefined' ||
          typeof token_count[sig] === 'undefined'
        ) {
          return;
        }

        const utxo = 'utxo_' + utxos[i].txid + '_' + utxos[i].vout;
        const address_amt =
          'a_' + utxos[i].addr + '_' + utxos[i].tick + '_' + utxos[i].id;

        try {
          let amt = await this.db.get(address_amt);
          amt = BigInt(amt) + BigInt(utxos[i].amt);
          await this.db.put(address_amt, amt.toString());
          await this.db.put(utxo, JSON.stringify(utxos[i]));

          //console.log('3rd push', utxos[i]);
        } catch (e) {
          await this.db.put(address_amt, utxos[i].amt);
          await this.db.put(utxo, JSON.stringify(utxos[i]));
          //console.log('4th push', utxos[i]);
        }
      }
    }
  }

  /**
   * Manages mints for the selected ticker:id in the op_return it is processing.
   *
   * @param block
   * @param blockhash
   * @param vout
   * @param tx
   * @param res
   * @param ops
   * @returns {Promise<void>}
   */
  async indexMint(
    block: number,
    blockhash: string,
    vout: any,
    tx: any,
    res: any,
    ops: any,
  ) {
    if (ops.length !== 7) return;

    const hex = ops[3];
    const base = 10;
    const bn = BigInt('0x' + hex);
    const int_ticker = BigInt(bn.toString(base));

    const ticker = toString26(int_ticker);
    if (ticker === '') return;

    const id =
      ops[4].startsWith('OP_') &&
      typeof this.op_table['i_' + ops[4]] !== 'undefined'
        ? this.op_table['i_' + ops[4]]
        : parseInt(ops[4], 16);
    if (isNaN(id) || id < 0 || id > 999999) return;

    const output =
      ops[5].startsWith('OP_') &&
      typeof this.op_table['i_' + ops[5]] !== 'undefined'
        ? this.op_table['i_' + ops[5]]
        : parseInt(ops[5], 16);
    if (isNaN(output) || output < 0) return;

    let mint;

    if (block < this.legacy_block_end) {
      if (isNaN(parseInt(hexToString(ops[6])))) {
        mint = ops[6];
      } else {
        mint = hexToString(ops[6]);
      }
    } else {
      mint = hexToString(ops[6]);
    }

    if (mint.startsWith('0') && !mint.startsWith('0.')) return;
    if (mint.includes('.') && mint.endsWith('0')) return;
    if (mint.endsWith('.')) return;

    const deployment = await this.getDeployment(ticker, id);

    if (deployment !== null) {
      if (countDecimals(mint) > deployment.dec) return;

      deployment.lim = BigInt(deployment.lim);
      deployment.rem = BigInt(deployment.rem);

      mint = resolveNumberString(mint, deployment.dec);

      const _total_limit = this.total_limit;
      let _mint = BigInt(mint);

      if (_mint <= 0 || _mint > _total_limit) return;

      if (typeof res.vout[output] === 'undefined') return;
      const res_vout = Script.decode(res.vout[output].scriptPubKey, false);
      if (res_vout[0] === 'OP_RETURN') return;

      if (deployment.rem === 0n) return;
      if (
        _mint <= 0n ||
        _mint > deployment.lim ||
        deployment.lim > deployment.max
      )
        return;

      if (deployment.rem - _mint < 0n) {
        _mint = deployment.rem;
      }

      deployment.rem -= _mint;
      deployment.lim = deployment.lim.toString();
      deployment.rem = deployment.rem.toString();

      try {
        const to_address = Address.fromScriptPubKey(
          res.vout[output].scriptPubKey,
          this.network,
        );
        const utxo = 'utxo_' + tx.txid + '_' + output;

        const _utxo = {
          addr: to_address,
          txid: tx.txid,
          vout: output,
          tick: deployment.tick,
          id: deployment.id,
          amt: _mint.toString(),
        };

        await this.db.put(utxo, JSON.stringify(_utxo));
        await this.db.put('d_' + ticker + '_' + id, JSON.stringify(deployment));
        const address_amt = 'a_' + to_address + '_' + ticker + '_' + id;

        try {
          let amt = await this.db.get(address_amt);
          amt = BigInt(amt) + _mint;
          await this.db.put(address_amt, amt.toString());
        } catch (e) {
          await this.db.put(address_amt, _utxo.amt);
        }

        //console.log(await this.db.get(utxo));
      } catch (e) {
        this.logger.error(e);
      }
    }
  }

  /**
   * Manages deployments for the selected ticker:id in the op_return it is processing.
   * This also includes collectible attachments (PIPE | Art) from the transaction's witness data.
   *
   * @param block
   * @param blockhash
   * @param vout
   * @param tx
   * @param res
   * @param ops
   * @returns {Promise<void>}
   */
  async indexDeployment(
    block: number,
    blockhash: string,
    vout: any,
    tx: any,
    res: any,
    ops: any,
  ) {
    try {
      if (ops.length !== 9) return;

      const b26_int = parseInt(ops[3], 16);
      if (isNaN(b26_int)) return;

      const id =
        ops[4].startsWith('OP_') &&
        typeof this.op_table['i_' + ops[4]] !== 'undefined'
          ? this.op_table['i_' + ops[4]]
          : parseInt(ops[4], 16);
      if (isNaN(id) || id < 0 || id > 999999) return;

      const output =
        ops[5].startsWith('OP_') &&
        typeof this.op_table['i_' + ops[5]] !== 'undefined'
          ? this.op_table['i_' + ops[5]]
          : parseInt(ops[5], 16);
      if (isNaN(output) || output < 0) return;

      const decimals =
        ops[6].startsWith('OP_') &&
        typeof this.op_table['i_' + ops[6]] !== 'undefined'
          ? this.op_table['i_' + ops[6]]
          : parseInt(ops[6], 16);
      if (isNaN(decimals) || decimals < 0 || decimals > 8) return;

      const hex = ops[3];
      const base = 10;
      const bn = BigInt('0x' + hex);
      const int_ticker = BigInt(bn.toString(base));

      const ticker = toString26(int_ticker);

      // check if token already exists
      if ((await this.getDeployment(ticker, id)) !== null) return;

      let max = '';
      let limit = '';

      if (block < this.legacy_block_end) {
        if (isNaN(parseInt(hexToString(ops[7])))) {
          max = ops[7];
        } else {
          max = hexToString(ops[7]);
        }

        if (isNaN(parseInt(hexToString(ops[8])))) {
          limit = ops[8];
        } else {
          limit = hexToString(ops[8]);
        }
      } else {
        max = hexToString(ops[7]);
        limit = hexToString(ops[8]);
      }

      if (max.startsWith('0') && !max.startsWith('0.')) return;
      if (max.includes('.') && max.endsWith('0')) return;
      if (max.endsWith('.')) return;
      if (limit.startsWith('0') && !limit.startsWith('0.')) return;
      if (limit.includes('.') && limit.endsWith('0')) return;
      if (limit.endsWith('.')) return;

      if (countDecimals(max) > decimals) return;
      if (countDecimals(limit) > decimals) return;

      max = resolveNumberString(max, decimals);
      limit = resolveNumberString(limit, decimals);

      const _total_limit = this.total_limit;
      const _max = BigInt(max);
      const _limit = BigInt(limit);

      if (_max <= 0 || _max > _total_limit) return;
      if (_limit <= 0 || _limit > _total_limit) return;

      if (typeof res.vout[output] === 'undefined') return;
      const res_vout = Script.decode(res.vout[output].scriptPubKey, false);
      if (res_vout[0] === 'OP_RETURN') return;

      const to_address = Address.fromScriptPubKey(
        res.vout[output].scriptPubKey,
        this.network,
      );

      const deployment = 'd_' + ticker + '_' + id;

      try {
        await this.db.get(deployment); // if it already exists
      } catch (e) {
        let collection_address = null;
        let collection_number = null;
        let mint_to_beneficiary = false;
        let mint_to_beneficiary_output = 0;
        let mint_to_beneficiary_to_address = null;

        for (let i = 0; i < tx.vin.length; i++) {
          if (tx.vin[i].txinwitness.length === 3) {
            try {
              const decoded = Script.decode(tx.vin[i].txinwitness[1], false);

              if (
                decoded.length >= 12 &&
                decoded[4] === this.op_table.p &&
                decoded[5] === this.op_table.a
              ) {
                if (
                  decoded[6] !== this.op_table.i &&
                  decoded[6] !== this.op_table.r
                ) {
                  return;
                }

                let mime = null;
                let ref = null;

                if (decoded[6] === this.op_table.i) {
                  try {
                    mime = hexToString(decoded[7]);
                    const bytes = hexToBytes(decoded[8]);

                    if (bytes.length === 0 || bytes[0] === 0) {
                      return;
                    }
                  } catch (e) {
                    return;
                  }
                } else if (decoded[6] === this.op_table.r) {
                  ref = new TextDecoder().decode(hexToBytes(decoded[8]));

                  if (ref === '' || ref.includes('\x00') || ref === 'OP_0') {
                    return;
                  }

                  if (decoded[9] !== this.op_table.n) {
                    return;
                  }
                } else {
                  return;
                }

                let number_position = 0;

                for (let j = 0; j < decoded.length; j++) {
                  if (decoded[j] === this.op_table.n) {
                    number_position = j;
                    break;
                  }
                }

                if (
                  number_position === 0 ||
                  (number_position !== 0 &&
                    (typeof decoded[number_position + 1] === 'undefined' ||
                      typeof decoded[number_position + 2] === 'undefined'))
                ) {
                  return;
                }

                let num1: any = decoded[number_position + 1];
                num1 =
                  num1.startsWith('OP_') &&
                  typeof this.op_table['i_' + num1] !== 'undefined'
                    ? this.op_table['i_' + num1]
                    : parseInt(num1, 16);

                let num2: any = decoded[number_position + 2];
                num2 =
                  num2.startsWith('OP_') &&
                  typeof this.op_table['i_' + num2] !== 'undefined'
                    ? this.op_table['i_' + num2]
                    : parseInt(num2, 16);

                if (
                  isNaN(num1) ||
                  isNaN(num2) ||
                  num1 < 0 ||
                  num1 > num2 ||
                  num1 > 999_999_999 ||
                  num2 > 999_999_999
                )
                  return;

                if (
                  typeof decoded[number_position + 3] !== 'undefined' &&
                  decoded[number_position + 3] === this.op_table.b &&
                  typeof decoded[number_position + 4] !== 'undefined' &&
                  decoded[number_position + 4] !== 'OP_0'
                ) {
                  mint_to_beneficiary = true;
                  mint_to_beneficiary_output =
                    decoded[number_position + 4].startsWith('OP_') &&
                    typeof this.op_table[
                      'i_' + decoded[number_position + 4]
                    ] !== 'undefined'
                      ? this.op_table['i_' + decoded[number_position + 4]]
                      : parseInt(decoded[number_position + 4], 16);
                  mint_to_beneficiary_output -= 1;
                  if (
                    isNaN(mint_to_beneficiary_output) ||
                    mint_to_beneficiary_output < 0
                  )
                    return;
                  if (
                    typeof res.vout[mint_to_beneficiary_output] === 'undefined'
                  )
                    return;
                  const mint_to_decoded = Script.decode(
                    res.vout[mint_to_beneficiary_output].scriptPubKey,
                    false,
                  );
                  if (mint_to_decoded[0] === 'OP_RETURN') return;
                  mint_to_beneficiary_to_address = Address.fromScriptPubKey(
                    res.vout[mint_to_beneficiary_output].scriptPubKey,
                    this.network,
                  );
                } else if (
                  typeof decoded[number_position + 3] !== 'undefined' &&
                  decoded[number_position + 3] !== this.op_table.b
                ) {
                  return;
                }

                let traits = null;

                if (
                  typeof decoded[number_position + 5] !== 'undefined' &&
                  this.op_table.t === decoded[number_position + 5]
                ) {
                  traits = [];

                  for (
                    let j = number_position + 6;
                    j < decoded.length - 2;
                    j++
                  ) {
                    const trait = new TextDecoder().decode(
                      hexToBytes(decoded[j]),
                    );

                    if (
                      trait === '' ||
                      trait.includes('\x00') ||
                      decoded[j] === 'OP_0'
                    ) {
                      return;
                    }

                    traits.push(trait);
                  }

                  if (traits.length % 2 !== 0) {
                    return;
                  }
                } else if (
                  typeof decoded[number_position + 5] !== 'undefined' &&
                  this.op_table.tr === decoded[number_position + 5]
                ) {
                  if (typeof decoded[number_position + 4] === 'undefined') {
                    return;
                  }

                  traits = new TextDecoder().decode(
                    hexToBytes(decoded[number_position + 6]),
                  );

                  if (
                    traits === '' ||
                    traits.includes('\x00') ||
                    traits === 'OP_0'
                  ) {
                    return;
                  }
                }

                if (
                  decoded[1] !== 'OP_CHECKSIG' ||
                  typeof decoded[decoded.length - 1] === 'undefined' ||
                  decoded[decoded.length - 1] !== 'OP_ENDIF'
                ) {
                  return;
                }

                // must be a taproot address
                collection_address = Address.fromScriptPubKey(
                  ['OP_1', decoded[0]],
                  this.network,
                );

                try {
                  await this.db.get('c_' + collection_address + '_' + num1);
                  // not throwing, exists already
                  return;
                } catch (e) {
                  let c_max = 0;

                  try {
                    c_max = await this.db.get('c_max_' + collection_address);

                    if (num2 > c_max) {
                      c_max = num2;
                      await this.db.put('c_max_' + collection_address, num2);
                    }
                  } catch (e) {
                    c_max = num2;
                    await this.db.put('c_max_' + collection_address, num2);
                  }

                  collection_number = num1;

                  ////////////
                  const chunks = [];
                  let started = false;
                  let encoding = null;
                  for (const k in decoded) {
                    if (
                      started &&
                      encoding !== null &&
                      decoded[k] !== this.op_table.n
                    ) {
                      chunks.push(decoded[k]);
                    }
                    if (encoding === null && started) {
                      encoding = decoded[k];
                    }
                    if (decoded[k] === this.op_table.i) {
                      started = true;
                    }
                    if (decoded[k] === this.op_table.n) {
                      started = false;
                      break;
                    }
                  }
                  const hex = chunks.join('');
                  ////////////

                  await this.db.put(
                    'c_' + collection_address + '_' + num1,
                    JSON.stringify({
                      tick: ticker,
                      id: id,
                      dec: decimals,
                      max: max,
                      lim: limit,
                      rem: max,
                      tx: tx.txid,
                      vo: vout,
                      bvo: output,
                      baddr: to_address,
                      col: collection_address,
                      colnum: num1,
                      blck: block,
                      traits: traits,
                      mime: mime,
                      metadata: hex,
                      ref: ref,
                    }),
                  );

                  /*
                                  console.log({
                                      tick : ticker,
                                      id : id,
                                      col : collection_address,
                                      num : num1,
                                      traits : traits,
                                      mime : mime,
                                      ref : ref
                                  });*/
                }

                break;
              }
            } catch (e) {}
          }
        }

        const _deployment = {
          tick: ticker,
          id: id,
          dec: decimals,
          max: max,
          lim: limit,
          rem: max,
          tx: tx.txid,
          vo: vout,
          bvo: output,
          baddr: to_address,
          col: collection_address,
          colnum: collection_number,
          blck: block,
          blckh: blockhash,
        };

        if (mint_to_beneficiary) {
          const d: any = _deployment;
          d.lim = BigInt(d.lim);
          d.rem = BigInt(d.rem);
          d.max = BigInt(d.max);

          const mint = d.lim;

          const _total_limit = this.total_limit;
          let _mint = BigInt(mint);

          if (_mint <= 0 || _mint > _total_limit) return;

          if (typeof res.vout[mint_to_beneficiary_output] === 'undefined')
            return;

          if (d.rem === 0n) return;
          if (_mint <= 0n || _mint > d.lim || d.lim > d.max) return;

          if (d.rem - _mint < 0n) {
            _mint = d.rem;
          }

          d.rem -= _mint;

          try {
            const utxo = 'utxo_' + tx.txid + '_' + mint_to_beneficiary_output;

            const _utxo = {
              addr: mint_to_beneficiary_to_address || '',
              txid: tx.txid,
              vout: mint_to_beneficiary_output,
              tick: ticker,
              id: id,
              amt: _mint.toString(),
            };

            d.lim = d.lim.toString();
            d.rem = d.rem.toString();
            d.max = d.max.toString();

            await this.db.put(utxo, JSON.stringify(_utxo));
            await this.db.put('d_' + ticker + '_' + id, JSON.stringify(d));

            const address_amt =
              'a_' + mint_to_beneficiary_to_address + '_' + ticker + '_' + id;

            try {
              let amt = await this.db.get(address_amt);
              amt = BigInt(amt) + _mint;
              await this.db.put(address_amt, amt.toString());
            } catch (e) {
              await this.db.put(address_amt, _utxo.amt);
            }

            _deployment.rem = d.rem.toString();

            //console.log(await this.db.get(utxo));
          } catch (e) {
            this.logger.error(e);
          }
        }

        await this.db.put(deployment, JSON.stringify(_deployment));
        await this.db.put(
          'da_' + to_address + '_' + ticker + '_' + id,
          deployment,
        );

        //console.log(await this.db.get(deployment));
      }
    } catch (e) {}
  }
}
