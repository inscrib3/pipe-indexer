import axios from 'axios';
import { sleep } from './helpers';

export class RPC {
  private rpcEndpoint;
  private logger;

  constructor(rpcEndpoint: string, logger: any) {
    this.rpcEndpoint = rpcEndpoint;
    this.logger = logger;
  }

  async call(method: string, params: any[] = []) {
    const payload = {
      jsonrpc: '1.0',
      id: 'rpc_call_' + Date.now(),
      method,
      params,
    };

    const config = {
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    };

    const baseDelay = 1000;
    const delay = baseDelay;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const response = await axios.post(this.rpcEndpoint, payload, config);
        return response.data.result;
      } catch (error) {
        if (error.response) {
          this.logger.error(
            `RPC request ${method} ${JSON.stringify(
              params,
            )} failed with error: ${error.message}, ${JSON.stringify(
              error.response.data,
            )}`,
          );
        } else {
          this.logger.error(
            `RPC request ${method} ${JSON.stringify(
              params,
            )} failed with error: ${error.message}`,
          );
        }
        if (attempt === 4) {
          this.logger.error('RPC request attempts exhausted');
          return null;
        }
        await sleep(Math.pow(2, attempt) * delay);
      }
    }
  }
}
