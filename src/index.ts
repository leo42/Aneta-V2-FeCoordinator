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
export const config = JSON.parse((await readFile(args.config || './config.json')).toString());
 console.log(config)
 
start()
startPaths()