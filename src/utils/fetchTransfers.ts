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

export const groupTransfers = (transfers: Transfer[], grouping: 'hour' | 'day'): Map<number, Transfer[]> => {
  const groupedTransfers = new Map<number, Transfer[]>();

  const groupingInterval = grouping === 'hour' ? 3600 : 86400;

  transfers.forEach(transfer => {
    const roundedTimestamp = Math.floor(Number(transfer.blockTimestamp) / groupingInterval) * groupingInterval;

    if (!groupedTransfers.has(roundedTimestamp)) {
      groupedTransfers.set(roundedTimestamp, []);
    }
    groupedTransfers.get(roundedTimestamp)?.push(transfer);
  });

  return groupedTransfers;
};
