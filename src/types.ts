import * as Lucid  from 'lucid-cardano'

export type protocolConfig = {
    redemptionMargin: number
    btcNetworkFeeMultiplyer: number
    fixedFee: number
    margin: number
    utxoCharge: number
    maxConsolidationTime: number
    consolidationThreshold : number
    minMint: number
    minRedemption: number
    maxBtcFeeRate : number 
    mintDeposit: number
    mintTimeoutMinutes: number  
    adminAddress: string
    finality: {
      cardano: number
      bitcoin: number
    }
    contract: string
}


export type topologyConfig = {

    
    "topology" : [
        {
          "name": string ,
          "ip": string,
          "port": number,
          "AdaPkHash": string,
          "btcKey": string
          },
    ],    
    "m": number
}

export interface Request {
  txHash: string,
  txIndex: number,
  txBlock: number,
  clientAccount : string,
  clientAddress: string,
  state: requestState
  amount: number,
}

export interface MintRequest extends Request { 
    paymentPath: number,
    paymentAddress: string
    paymentTx?: string[],
}

export interface RedemptionRequest extends Request {
    burnTx?: string,
    redemptiontx?: string,
}



export const MintRequestSchema = Lucid.Data.Object({
    amount: Lucid.Data.Integer(),
    path: Lucid.Data.Integer(),
  });

export enum requestState {
    received,
    rejected,
    confescated,
    completed
}

export enum PaymentPathState {
    open,
    served,
    processing,
    completed
}



export type PaymentPath = {
  index: number,
  address: string,
  state: string,
  serveTime: number
}