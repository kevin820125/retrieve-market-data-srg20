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
    liquidity_in_usd: string;
  };
}

interface LiquidityPoint {
  timestamp: string;
  liquidity: string;
}

export const liquidityHistoryHandler = async (req: Request, res: Response) => {
  const tokenAddress = req.params.tokenAddress.toLowerCase();

  try {
    const [fromTransfers, toTransfers] = await Promise.all([
      fetchTransfers(tokenAddress, 'from'),
      fetchTransfers(tokenAddress, 'to')
    ]);

    const combinedTransfers = [...fromTransfers, ...toTransfers];
    const dailyGroupedTransfers = groupTransfers(combinedTransfers, 'day');
    const liquidityHistory = await processLiquidityHistory(dailyGroupedTransfers, tokenAddress);

    res.status(200).json(liquidityHistory);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch liquidity history.' });
  }
};

const processLiquidityHistory = async (groupedTransfers: Map<number, Transfer[]>, tokenAddress: string): Promise<LiquidityPoint[]> => {
  let liquidityHistory: LiquidityPoint[] = [];

  for (const [dayTimestamp, transfers] of groupedTransfers) {
    const representativeBlockNumber = transfers[0].blockNumber;

    const query = gql`
      {
        ticker(block: {number: ${representativeBlockNumber}}, id: "${tokenAddress}") {
          liquidity_in_usd
        }
      }
    `;

    try {
      const response = await graphQLClient.request<TickerResponse>(query);
      const liquidity = response.ticker ? response.ticker.liquidity_in_usd : '0';

      const timestamp = format(new Date(dayTimestamp * 1000), 'PPpp');
      liquidityHistory.push({ timestamp, liquidity });
    } catch (error) {
      console.error(`Error fetching liquidity for block ${representativeBlockNumber}:`, error);
    }
  }

  return liquidityHistory;
};
