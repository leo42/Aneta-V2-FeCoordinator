import { start } from './indexer.js'
import { startPaths } from './paths.js';
import fs from 'fs';
import util from 'util';
import minimist from 'minimist';
import { protocolConfig, topologyConfig } from './types.js';

const readFile = util.promisify(fs.readFile);
const args  = minimist(process.argv.slice(2));

//const config  = JSON.parse((await readFile(args.cardanoConfig || './cardanoConfig.example.json')).toString());
export const protocol : protocolConfig = JSON.parse((await readFile(args.protocolConfig || './protocolConfig.example.json')).toString());
export const topology : topologyConfig =  JSON.parse((await readFile(args.topology || './topology.example.json')).toString());
export const config = {
    "utxoRpc": {
             "host": "https://preview.utxorpc-v0.demeter.run",
             "headers":  {"dmtr-api-key": "dmtr_utxorpc14cjctqdg5lhr8gpegjggh4x45grk4cwq"} 
         },
     "scriptAddress": "",
     "network": "preview",
     "paymentPaths": 10,
 }
 
 
start()
startPaths()