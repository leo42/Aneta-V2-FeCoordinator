import * as bitcoin from 'bitcoinjs-lib';
import {BIP32Factory , BIP32Interface} from 'bip32';
import * as ecc  from 'tiny-secp256k1'
import {ECPairFactory}  from 'ecpair'
import { topology , config } from './index.js';
import { MongoClient } from 'mongodb';
import {PaymentPath , PaymentPathState} from './types.js';

const bip32 = BIP32Factory(ecc);
const client = new MongoClient(config.mongoUrl);
const mongo =  client.db("webData");
export async function startPaths(){
    await client.connect();
    // trigger every 10 seconds
    setInterval(() => {
        checkPaths();    
    }, 10000);
}


async function checkPaths(){
    for(let i = 0; i < config.paymentPaths; i++){
        const path = await mongo.collection("paths").findOne({index: i});
        if(!path){
            const paymentPath : PaymentPath = { index: i, state: PaymentPathState.open , address: getAddress(i) , serveTime: 0};
            await mongo.collection("paths").insertOne(paymentPath);
        }else{ 
            if(path.state === PaymentPathState.served, Date.now() -  path.serveTime > config.pathReleaseTime ){
                await mongo.collection("paths").updateOne({index: i}, { $set: {state: PaymentPathState.open}});
            }
            if(path.state === PaymentPathState.completed){
                const balance = await getBitcoinAddressBalance(path.address);
                if(balance === 0){
                    await mongo.collection("paths").updateOne({index: i}, { $set: {state: PaymentPathState.open}});
                }
                
            }
        }
    }
}

async function getBitcoinAddressBalance(address: string): Promise<number> {
    const network = config.btcNetwork === 'mainnet' ? 'main' : 'test3';
    const url = `https://api.blockcypher.com/v1/btc/${network}/addrs/${address}/balance`;
    try {
        const response = await fetch(url);
        const data = await response.json();
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
    const p2shAddress = bitcoin.payments.p2wsh({
        redeem: bitcoin.payments.p2ms({ m: topology.m , pubkeys ,
        network: bitcoin.networks[config.btcNetwork], }),
        network: bitcoin.networks[config.btcNetwork],
    });

    return p2shAddress.address; 
}