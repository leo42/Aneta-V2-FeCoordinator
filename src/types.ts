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

export type MintRequest = {
    clientAddress : string,
    amount: number,
    state: string,
    paymentPath: number
}

export const MintRequestSchema = Lucid.Data.Object({
    amount: Lucid.Data.Integer(),
    path: Lucid.Data.Integer(),
  });
  