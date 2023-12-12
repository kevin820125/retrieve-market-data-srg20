import { Request, Response } from 'express';
import { format } from 'date-fns';
import { gql } from 'graphql-request';
import { graphQLClient } from '../utils/graphqlClient';
import { fetchTransfers, groupTransfersByHour } from '../utils/fetchTransfers';

interface Transfer {
  blockNumber: string;
  blockTimestamp: string;
}

interface TickerResponse {
  tickers: {
    last_price: string;
  }[];
}

interface PricePoint {
  blockNumber: string;
  timestamp: string;
  price: string;
}

export const priceHistoryHandler = async (req: Request, res: Response) => {
  const tokenAddress = req.params.tokenAddress.toLowerCase();

  try {
    const fromTransfersPromise = fetchTransfers(tokenAddress, 'from');
    const toTransfersPromise = fetchTransfers(tokenAddress, 'to');

    const [fromTransfers, toTransfers] = await Promise.all([fromTransfersPromise, toTransfersPromise]);

    const combinedTransfers = [...fromTransfers, ...toTransfers];

    const uniqueTransfersMap = new Map<string, Transfer>();
    combinedTransfers.forEach(transfer => {
      uniqueTransfersMap.set(transfer.blockNumber, transfer);
    });

    const uniqueTransfers = Array.from(uniqueTransfersMap.values());
    uniqueTransfers.sort((a, b) => Number(a.blockTimestamp) - Number(b.blockTimestamp));

    const groupedTransfers = groupTransfersByHour(uniqueTransfers);
    const priceHistory = await processPriceHistory(groupedTransfers);

    res.json(priceHistory);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch price history.' });
  }
};

const processPriceHistory = async (groupedTransfers: Map<number, Transfer[]>): Promise<PricePoint[]> => {
  let priceHistory: PricePoint[] = [];

  for (const [hourTimestamp, transfers] of groupedTransfers) {
    const representativeBlockNumber = transfers[0].blockNumber;

    const query = gql`
      {
        tickers(block: {number: ${representativeBlockNumber}}) {
          last_price
        }
      }
    `;

    try {
      const response = await graphQLClient.request<TickerResponse>(query);
      const price = response.tickers.length > 0 ? response.tickers[0].last_price : '0';

      const timestamp = format(new Date(hourTimestamp * 1000), 'PPpp');
      priceHistory.push({ blockNumber: representativeBlockNumber, timestamp, price });
    } catch (error) {
      console.error(`Error fetching price for block ${representativeBlockNumber}:`, error);
    }
  }

  return priceHistory;
};
