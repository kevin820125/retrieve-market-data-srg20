import { gql } from 'graphql-request';
import { graphQLClient } from './graphqlClient';

interface Transfer {
  blockNumber: string;
  blockTimestamp: string;
}

const MAX_TRANSFERS_PER_QUERY = 100;

export const fetchTransfers = async (tokenAddress: string, direction: 'from' | 'to'): Promise<Transfer[]> => {
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

export const groupTransfersByHour = (transfers: Transfer[]): Map<number, Transfer[]> => {
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
