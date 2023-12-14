import express from 'express';
import cors from 'cors'
import bodyParser from 'body-parser'

import { priceHistoryHandler } from './handlers/priceHistoryHandler';
import { volumeHistoryHandler } from './handlers/volumeHistoryHandler';
import { liquidityHistoryHandler } from './handlers/liquidityHistoryHandler';

const app: express.Application = express();
const port: number = 3000;

app.use(cors());
app.use(bodyParser.json());

app.get('/', (req, res) => {
  const protocol = req.secure ? 'https' : 'http';
  const hostname = req.hostname;

  const baseURL = hostname.includes('render.com') ? `https://${hostname}` : `${protocol}://${req.hostname}:${port}`;

  res.status(200).send(`
    <pre>
      \n This retrieves historical market indicators for SRG20 tokens using a token entry.
      \n Use following URL handlers to get according data:
      \n * Price history: ${baseURL}/price-history/:tokenAddress
      \n * Volume history: ${baseURL}/volume-history/:tokenAddress
      \n * Liquidity history: ${baseURL}/liquidity-history/:tokenAddress
    </pre>
  `);
});

app.get('/price-history/:tokenAddress', priceHistoryHandler);
app.get('/volume-history/:tokenAddress', volumeHistoryHandler);
app.get('/liquidity-history/:tokenAddress', liquidityHistoryHandler);

app.listen(port, () => {
  console.log(`Server is running at port ${port}`);
});
