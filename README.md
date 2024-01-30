# Pipe Indexer by Inscrib3

![Indexing](/preview.png "Preview of Indexer")

Indexing Pipe protocol tokens and related actions like transfers, deployments, mints.

## Docs

We are running two different instances one for testnet one for mainnet.

You can find docs and use our API for free directly from here:

[https://indexer.inspip.com/docs](https://indexer.inspip.com/docs)

[https://indexer-testnet.inspip.com/docs](https://indexer-testnet.inspip.com/docs)

## Local

Duplicate `.env.example` and rename to `.env`.

Update environment variables expecially Quick Node instance `BITCOIN_NODE_URL`.

Run the following command to start the server locally using docker

```bash
docker compose -f docker-compose-local.yml up -d
```

## Production

`CERTBOT_EMAIL` is used in production for SSL.

Update `server_name` inside `nginx/nginx-override.conf` to your domain.

Point your domain using DNS to the IP of the indexer.

Run the following command to start the server using docker;

```bash
docker compose up -d
```
