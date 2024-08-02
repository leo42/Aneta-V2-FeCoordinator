import { start } from './indexer.js'
import { startPaths } from './paths.js';
import fs from 'fs';
import util from 'util';
import minimist from 'minimist';
import { protocolConfig, topologyConfig } from './types.js';
import { connect } from './db.js';
const readFile = util.promisify(fs.readFile);
const args  = minimist(process.argv.slice(2));


//const config  = JSON.parse((await readFile(args.cardanoConfig || './cardanoConfig.example.json')).toString());
export const protocol : protocolConfig = JSON.parse((await readFile(args.protocolConfig || './config/protocolConfig.json')).toString());
export const topology : topologyConfig =  JSON.parse((await readFile(args.topology || './config/topology.json')).toString());
export const config = JSON.parse((await readFile(args.config || './config/config.json')).toString());
await connect(config.mongoUrl)

 console.log(config)
 
start()
startPaths()