import * as bitcoin from 'bitcoinjs-lib';
import {BIP32Factory , BIP32Interface} from 'bip32';
import * as ecc  from 'tiny-secp256k1'
import {ECPairFactory}  from 'ecpair'
import { topology , config } from './index.js';
import {PaymentPath , PaymentPathState} from './types.js';
import { getDb } from './db.js';
import { Db } from 'mongodb';

let mongo : Db
export async function startPaths(){
    // trigger every 10 seconds
    mongo =  getDb("webData");
    setInterval(() => {
        checkPaths();    
    }, 1000 * 60 * 1);
}


async function checkPaths(){
    console.log('Checking paths');  
    for(let i = 0; i < config.paymentPaths; i++){
        const path = await mongo.collection("paths").findOne({index: i});
        if(!path){
            const paymentPath : PaymentPath = { index: i, state: PaymentPathState.open , address: getAddress(i) , serveTime: 0};
            await mongo.collection("paths").insertOne(paymentPath);
        }else{ 
            if(path.state === PaymentPathState.served, Date.now() -  path.serveTime > config.pathReleaseTime ){
                await mongo.collection("paths").updateOne({index: i, state: PaymentPathState.served}, { $set: {state: PaymentPathState.open}});
            }
            if(path.state === PaymentPathState.completed){
                //const balance = await getBitcoinAddressBalance(path.address);
                if(isPathFree(path.index)){
                    await mongo.collection("paths").updateOne({index: i , state: PaymentPathState.completed}, { $set: {state: PaymentPathState.open}});
                }
                
            }
        }
    }
}


async function isPathFree(index: number){
  const response = await fetch(`${config.GAUrl}/paymentpaths/${index}`);
  const data = await response.json();
  return data.state === 0 
}

async function getBitcoinAddressBalance(address: string): Promise<number> {
    const network = config.btcNetwork === 'mainnet' ? 'main' : 'test3';
    const token = config.blockcypherToken;
    console.log(`Fetching Bitcoin address balance for ${address}..token ${token}.`);
    const url = `https://api.blockcypher.com/v1/btc/${network}/addrs/${address}/balance?token=${token}`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        console.log(data);
        // The balance is usually in satoshis, convert to BTC if necessary
        const balanceInBTC = data.balance / 1e8;
        console.log(`Balance for ${address}: ${balanceInBTC} BTC`);
        return balanceInBTC;
    } catch (error) {
        console.error('Error fetching Bitcoin address balance:', error);
        throw error;
    }
}


export function getAddress(index: number){
    if(index < 0 || index >= config.paymentPaths) throw new Error('Index out of range');
    const HexKeys =  topology.topology.map((guardian , guardianIndex) => {
        const bip32 = BIP32Factory(ecc);
        const parent = bip32.fromBase58(guardian.btcKey);
        const child = parent.derive(0);
        return guardianIndex === 0 ? child.derive(index+1).publicKey.toString('hex') : child.derive(0).publicKey.toString('hex'); 
    });
    const pubkeys = HexKeys.map(key => Buffer.from(key, 'hex'));
    console.log(pubkeys);
    const p2shAddress = bitcoin.payments.p2wsh({
        redeem: bitcoin.payments.p2ms({ m: topology.m , pubkeys ,
        network: bitcoin.networks[config.btcNetwork], }),
        network: bitcoin.networks[config.btcNetwork],
    });

    return p2shAddress.address; 
}