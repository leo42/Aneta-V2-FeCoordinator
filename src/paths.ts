import * as bitcoin from 'bitcoinjs-lib';
import {BIP32Factory , BIP32Interface} from 'bip32';
import * as ecc  from 'tiny-secp256k1'
import {ECPairFactory}  from 'ecpair'
import { topology , config } from './index.js';
import { MongoClient } from 'mongodb';


const bip32 = BIP32Factory(ecc);
const client = new MongoClient("mongodb://127.0.0.1:27017");
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
        const path = await mongo.collection("paths").findOne({path: i});
        if(!path){
            await mongo.collection("paths").insertOne({path: i, address: getAddress(i)});
        }
    }
    const paths = Array.from({length: config.paymentPaths}, (_, index) => getAddress(index));
    console.log(paths);
}

function getAddress(index: number){
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
        network: bitcoin.networks[config.network], }),
        network: bitcoin.networks[config.network],
    });

    return p2shAddress.address; 
}