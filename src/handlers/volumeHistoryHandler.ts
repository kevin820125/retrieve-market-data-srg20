import { Request, Response } from 'express';
import { format, utcToZonedTime } from 'date-fns-tz';
import { gql } from 'graphql-request';
import { graphQLClient } from '../utils/graphqlClient';
import { fetchTransfers, groupTransfers } from '../utils/fetchTransfers';

interface Transfer {
  blockNumber: string;
  blockTimestamp: string;
}

interface TickerResponse {
  ticker: {
    target_volume: string;
  };
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
    const dailyGroupedTransfers = groupTransfers(combinedTransfers, 'day');
    const volumeHistory = await processVolumeHistory(dailyGroupedTransfers, tokenAddress);

    res.status(200).json(volumeHistory);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch volume history.' });
  }
};

const processVolumeHistory = async (groupedTransfers: Map<number, Transfer[]>, tokenAddress: string): Promise<VolumePoint[]> => {
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
        ticker(block: {number: ${currentBlockNumber}}, id: "${tokenAddress}") {
          target_volume
        }
      }
    `;
    const prevVolumeQuery = gql`
      {
        ticker(block: {number: ${prevBlockNumber}}, id: "${tokenAddress}") {
          target_volume
        }
      }
    `;

    try {
      const [currentResponse, prevResponse] = await Promise.all([
        graphQLClient.request<TickerResponse>(currentVolumeQuery),
        graphQLClient.request<TickerResponse>(prevVolumeQuery)
      ]);

      const currentVolume = currentResponse.ticker ? currentResponse.ticker.target_volume : '0';
      const prevVolume = prevResponse.ticker ? prevResponse.ticker.target_volume : '0';

      const volume24hr = (Number(currentVolume) - Number(prevVolume)).toString();
      const timestamp = format(utcToZonedTime(new Date(dayTimestamp * 1000), 'UTC'), 'PP');

      volumeHistory.push({ timestamp, volume24hr });
    } catch (error) {
      console.error(`Error fetching volume for block ${currentBlockNumber}:`, error);
    }
  }

  return volumeHistory;
};
