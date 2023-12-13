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
  tickers: {
    target_volume: string;
  }[];
}

interface VolumePoint {
  timestamp: string;
  volume24hr: string;
}

export const volumeHistoryHandler = async (req: Request, res: Response) => {
  const tokenAddress = req.params.tokenAddress.toLowerCase();

  try {
    const [fromTransfers, toTransfers] = await Promise.all([
      fetchTransfers(tokenAddress, 'from'),
      fetchTransfers(tokenAddress, 'to')
    ]);

    const combinedTransfers = [...fromTransfers, ...toTransfers];

    const uniqueTransfersMap = new Map<string, Transfer>();
    combinedTransfers.forEach(transfer => {
      uniqueTransfersMap.set(transfer.blockNumber, transfer);
    });

    const uniqueTransfers = Array.from(uniqueTransfersMap.values());
    uniqueTransfers.sort((a, b) => Number(a.blockTimestamp) - Number(b.blockTimestamp));

    const dailyGroupedTransfers = groupTransfers(combinedTransfers, 'day');
    const volumeHistory = await processVolumeHistory(dailyGroupedTransfers);

    res.json(volumeHistory);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch volume history.' });
  }
};

const processVolumeHistory = async (groupedTransfers: Map<number, Transfer[]>): Promise<VolumePoint[]> => {
  let volumeHistory: VolumePoint[] = [];

  for (const [dayTimestamp, transfers] of groupedTransfers) {
    const currentBlockNumber = transfers[transfers.length - 1].blockNumber;
    const prevDayTimestamp = dayTimestamp - 86400;
    const prevTransfers = groupedTransfers.get(prevDayTimestamp);

    if (!prevTransfers) {
      continue;
    }

    const prevBlockNumber = prevTransfers[prevTransfers.length - 1].blockNumber;

    const currentVolumeQuery = gql`
      {
        tickers(block: {number: ${currentBlockNumber}}) {
          target_volume
        }
      }
    `;
    const prevVolumeQuery = gql`
      {
        tickers(block: {number: ${prevBlockNumber}}) {
          target_volume
        }
      }
    `;

    try {
      const [currentResponse, prevResponse] = await Promise.all([
        graphQLClient.request<TickerResponse>(currentVolumeQuery),
        graphQLClient.request<TickerResponse>(prevVolumeQuery)
      ]);

      const currentVolume = currentResponse.tickers.length > 0 ? currentResponse.tickers[0].target_volume : '0';
      const prevVolume = prevResponse.tickers.length > 0 ? prevResponse.tickers[0].target_volume : '0';

      const volume24hr = (parseFloat(currentVolume) - parseFloat(prevVolume)).toString();
      const timestamp = format(new Date(dayTimestamp * 1000), 'PPpp');

      volumeHistory.push({ timestamp, volume24hr });
    } catch (error) {
      console.error(`Error fetching volume for block ${currentBlockNumber}:`, error);
    }
  }

  return volumeHistory;
};
