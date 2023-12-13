import { Request, Response } from 'express';
import { format } from 'date-fns';
import { gql } from 'graphql-request';
import { graphQLClient } from '../utils/graphqlClient';
import { fetchTransfers, groupTransfers } from '../utils/fetchTransfers';

interface Transfer {
  blockNumber: string;
  blockTimestamp: string;
}

interface TickerResponse {
  ticker: {
    last_price: string;
  };
}

interface PricePoint {
  timestamp: string;
  price: string;
}

export const priceHistoryHandler = async (req: Request, res: Response) => {
  const tokenAddress = req.params.tokenAddress.toLowerCase();

  try {
    const [fromTransfers, toTransfers] = await Promise.all([
      fetchTransfers(tokenAddress, 'from'),
      fetchTransfers(tokenAddress, 'to')
    ]);

    const combinedTransfers = [...fromTransfers, ...toTransfers];
    const hourlyGroupedTransfers = groupTransfers(combinedTransfers, 'hour');
    const priceHistory = await processPriceHistory(hourlyGroupedTransfers, tokenAddress);

    res.status(200).json(priceHistory);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch price history.' });
  }
};

const processPriceHistory = async (groupedTransfers: Map<number, Transfer[]>, tokenAddress: string): Promise<PricePoint[]> => {
  let priceHistory: PricePoint[] = [];

  for (const [hourTimestamp, transfers] of groupedTransfers) {
    const representativeBlockNumber = transfers[0].blockNumber;

    const query = gql`
      {
        ticker(block: {number: ${representativeBlockNumber}}, id: "${tokenAddress}") {
          last_price
        }
      }
    `;

    try {
      const response = await graphQLClient.request<TickerResponse>(query);
      const price = response.ticker ? response.ticker.last_price : '0';

      const timestamp = format(new Date(hourTimestamp * 1000), 'PPpp');
      priceHistory.push({ timestamp, price });
    } catch (error) {
      console.error(`Error fetching price for block ${representativeBlockNumber}:`, error);
    }
  }

  return priceHistory;
};
