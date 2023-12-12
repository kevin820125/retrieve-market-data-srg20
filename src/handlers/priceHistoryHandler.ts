import { Request, Response } from 'express';
import { format } from 'date-fns';
import { gql } from 'graphql-request';
import { graphQLClient } from '../utils/graphqlClient';

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

const MAX_TRANSFERS_PER_QUERY = 100;

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
    const priceHistory = await processPriceHistory(groupedTransfers, tokenAddress);

    res.json(priceHistory);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch price history.' });
  }
};

const fetchTransfers = async (tokenAddress: string, direction: 'from' | 'to'): Promise<Transfer[]> => {
  let transfers: Transfer[] = [];
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    const query = gql`
    {
      transfers(first: ${MAX_TRANSFERS_PER_QUERY}, skip: ${skip}, orderBy: blockTimestamp, orderDirection: asc, where: { ${direction}: "${tokenAddress}" }) {
        blockNumber
        blockTimestamp
      }
    }
    `;

    const response = await graphQLClient.request<{ transfers: Transfer[] }>(query);
    const fetchedTransfers = response.transfers.map(transfer => ({
      blockNumber: transfer.blockNumber,
      blockTimestamp: transfer.blockTimestamp
    }));

    transfers = transfers.concat(fetchedTransfers);
    if (fetchedTransfers.length < MAX_TRANSFERS_PER_QUERY) {
      hasMore = false;
    } else {
      skip += MAX_TRANSFERS_PER_QUERY;
    }
  }

  return transfers;
};

const groupTransfersByHour = (transfers: Transfer[]): Map<number, Transfer[]> => {
  const groupedTransfers = new Map<number, Transfer[]>();

  transfers.forEach(transfer => {
    const hourTimestamp = Math.floor(Number(transfer.blockTimestamp) / 3600) * 3600;

    if (!groupedTransfers.has(hourTimestamp)) {
      groupedTransfers.set(hourTimestamp, []);
    }
    groupedTransfers.get(hourTimestamp)?.push(transfer);
  });

  return groupedTransfers;
};

const processPriceHistory = async (groupedTransfers: Map<number, Transfer[]>, tokenAddress: string): Promise<PricePoint[]> => {
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
