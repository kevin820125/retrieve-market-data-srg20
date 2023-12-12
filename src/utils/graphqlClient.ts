import { GraphQLClient } from 'graphql-request';

const endpoint = 'https://api.thegraph.com/subgraphs/name/somemoecoding/surgeswap-v1-cg-bsc';
export const graphQLClient = new GraphQLClient(endpoint);
