import { MongoClient } from 'mongodb';
import { CardanoSyncClient , CardanoBlock } from "@utxorpc/sdk";
import { protocol, config } from './index.js';
import { getAddress } from './paths.js';
import axios from "axios";
import { MintRequestSchema , MintRequest, requestState , Request , RedemptionRequest } from './types.js';
import * as Lucid  from 'lucid-cardano'

const client = new MongoClient("mongodb://127.0.0.1:27017");
const mongo =  client.db("webData");
let openRequests: Array<[string, number, Date]> = [];
let lucid : Lucid.Lucid;
let address : string;
let Uint8ArrayAddress : Uint8Array;

export async function start() {
  console.log("Starting Indexer");
  await client.connect();
  startGarbageCollection()
  lucid = await Lucid.Lucid.new( undefined, (config.network.charAt(0).toUpperCase() + config.network.slice(1)) as Lucid.Network);
  const mintingScript =  {type: "PlutusV2" as Lucid.ScriptType, script: protocol.contract};
  const cBTCPolicy = lucid.utils.mintingPolicyToId(mintingScript);
  address =  lucid.utils.credentialToAddress({type: "Script", hash: cBTCPolicy});
  Uint8ArrayAddress =  convertAddressToBytes(address);

  console.log("cBTCPolicy", protocol);
  console.log("Address", address);
  await dumpHistory();
  startFollow();
}


async function startGarbageCollection(){
  setInterval(() => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - (3 * 24 * 60 * 60 * 1000));
    openRequests = openRequests.filter(([, , date]) => date > threeDaysAgo);
  }, 10000);
}



async function getTip() {
  try{
   const rcpClient = new CardanoSyncClient({ uri : config.utxoRpc.host,  headers:  config.utxoRpc.headers} );
   
  let tip = await axios.get("https://cardano-preview.blockfrost.io/api/v0/blocks/latest", {headers: {"project_id": "preview8RNLE7oZnZMFkv5YvnIZfwURkc1tHinO"}});
  return tip;
  }catch(e){
  }
}


async function startFollow() {
  let tip = await mongo.collection("height").findOne({type: "top"});
  let liveTip = await getTip();  
  console.log(liveTip.data)

  
  console.log("tip" , tip);
  let tipPoint = undefined ;   
  if(tip){
      tipPoint = [{slot: tip.slot, hash: new Uint8Array(Buffer.from(tip.hash, "hex"))}];
  }



  console.log("Starting indexer from tip", tipPoint);
  const rcpClient = new CardanoSyncClient({ uri : config.utxoRpc.host,  headers : config.utxoRpc.headers} );
  const stream =  rcpClient.followTip( tipPoint);
  console.log("Stream", stream);  
  try {
  console.log("Starting Indexer");
  for await (const block of stream ) {
      
      switch (block.action) { 
          case "apply":
              await handleNewBlock(block.block);
              break;
          case "undo":
              await handleUndoBlock(block.block); 
              break;
          case "reset":
              console.log(block.action, block.point);
              break;
          default:
              console.log("Strange Block");
              console.log(block);
      }
  }
  } catch (e) {
      console.log(e);
      //sleep for 5 seconds and restart the indexer
      setTimeout(() => {
        startFollow();
      }, 5000);
  }
}

async function dumpHistory(){
  console.log("Dumping History");
  try{
  const chunkSize = 100; 
  let tip = await mongo.collection("height").findOne({type: "top"});
  console.log("tip" , tip);
  let tipPoint = undefined ;   
  if(tip){
      tipPoint = {index: tip.slot, hash: new Uint8Array(Buffer.from(tip.hash, "hex"))};
  }
  console.log("Starting sync from tip", tipPoint);
  const rcpClient = new CardanoSyncClient({ uri : config.utxoRpc.host,  headers : config.utxoRpc.headers} );
  let chunk = await rcpClient.inner.dumpHistory( {startToken: tipPoint, maxItems: chunkSize})
 // console.log("Chunk", chunk);    
  
  while(chunk && chunk.nextToken ){
      console.time("Chunk")
     // console.log(chunk.nextToken)
      tipPoint = chunk.nextToken;
      for (const block of chunk.block) {
         await handleNewBlock(block.chain.value as CardanoBlock);
      };
      console.timeEnd("Chunk")
      //set tip to the last block
      const lastBlock = chunk.block[chunk.block.length - 1].chain.value as CardanoBlock;
   //   await mongo.collection("height").updateOne({type: "top"}, {$set: {hash: Buffer.from(lastBlock.header.hash).toString('hex') , slot: lastBlock.header.slot, height: lastBlock.header.height}}, {upsert: true});
      console.time("NextChunkFetch")
      chunk = await rcpClient.inner.dumpHistory( {startToken: tipPoint, maxItems: chunkSize})
      console.timeEnd("NextChunkFetch")
  } 

  console.log("Done Dumping History");
}catch(e){
  console.log(e);
 await dumpHistory();
}


  //exit the process
  console.log("Done Dumping History");
 }
 
function decodeDatum(datum: string)  {
  console.log("Decoding Datum", datum);
  return Lucid.Data.from(datum, MintRequestSchema);
}


 async function handleUndoBlock(block: CardanoBlock){
  let blockHeight = block.header.height;
  const blockHash = Buffer.from(block.header.hash).toString('hex');
  await mongo.collection("mint").deleteMany({height: blockHeight});
  await mongo.collection("burn").deleteMany({height: blockHeight});


  await mongo.collection("height").updateOne({type: "top"}, {$set: {hash: blockHash, slot: block.header.slot, height: block.header.height}}, {upsert: true});
}


 async function handleNewBlock(block: CardanoBlock) : Promise<Boolean>{
    let tip = await mongo.collection("height").findOne({type: "top"});

    if(tip && tip.height == block.header.height){
        console.log("Block rollback", block.header.hash , block.header.height, tip.height);
        return false;

    }else if(tip && tip.height >= block.header.height){
        throw new Error(`Block already processed ${block.header.height}, registered tip: ${tip.height}`); 

    }

   // console.log("New Block", block.header.height);
    

    let blockHash = Buffer.from(block.header.hash).toString('hex');
 // console.log("Tx",  Uint8ArrayAddress);

  await Promise.all(block.body.tx.map(async (tx) => {

    if(tx.outputs.some((output) => areUint8ArraysEqual(output.address, Uint8ArrayAddress))){
        tx.outputs.forEach(async (ouput, index) => {
           if(areUint8ArraysEqual(ouput.address, Uint8ArrayAddress)){
            openRequests.push([Buffer.from(tx.hash).toString('hex')  , index, new Date()]);
            try{
              if(ouput.assets.length === 0){
                await handleMintRequest(block, tx, index);
              }else{
                await handleRedemptionRequest(block, tx, index);
              } 
            }catch(e){
              console.log("Broken request found", e);
            }

          }
        });
        const txHash = Buffer.from(tx.hash).toString('hex');
        console.log("TxHash", txHash);
        // incoming request
    } 
    //check if a request is being completed
    
    if(tx.inputs.some((input) => 
        openRequests.some(([txHash, index]) => Buffer.from(input.txHash).toString('hex') === txHash && input.outputIndex === index))){
          handleRequestCompletion(block, tx);
          console.log("request Completion found", block.header.height, blockHash, tx.hash);
    }    
  }));  
}

function getSender(tx){
  const myAddressBytes = convertAddressToBytes(address);
  for(let i = 0; i < tx.outputs.length; i++){
    if(!areUint8ArraysEqual(tx.outputs[i].address, myAddressBytes)){
      return  convertAddressToBech32(tx.outputs[i].address);
    }
  }
}

async function handleMintRequest(block: CardanoBlock, tx: any, index: number){
  
  const txHash = Buffer.from(tx.hash).toString('hex');
  const txIndex = index;
  const txBlock =  Number(block.header.height);
  const clientAddress = getSender(tx);
  const clientAccount = lucid.utils.credentialToRewardAddress(lucid.utils.stakeCredentialOf(clientAddress));
  const datum = tx.outputs[index].datum.toJson().valueOf() as any;
  const amount = datum.constr.fields[0].bigInt.int;
  const paymentPath = Number(datum.constr.fields[1].bigInt.int);
  const state = requestState.received;
  const paymentAddress = getAddress(paymentPath)
  const mintRequestListing : MintRequest = {txHash, txIndex, txBlock, clientAccount, clientAddress, amount, state, paymentPath, paymentAddress};
  await mongo.collection("mintRequests").insertOne(mintRequestListing);
}


async function handleRedemptionRequest(block: CardanoBlock, tx: any, index: number){
  const txHash = Buffer.from(tx.hash).toString('hex');
  const txIndex = index;
  const txBlock =  Number(block.header.height);
  const clientAddress = getSender(tx);
  const clientAccount = lucid.utils.credentialToRewardAddress(lucid.utils.stakeCredentialOf(clientAddress));
  const amount = Number(tx.outputs[index].assets[0].assets[0].outputCoin);
  const state = requestState.received;
  const redemptionRequestListing : RedemptionRequest = {txHash, txIndex, txBlock, clientAccount, clientAddress, amount, state, burnTx: tx.inputs[0].txHash}; 
  await mongo.collection("redemptionRequests").insertOne(redemptionRequestListing);
}


async function handleRequestCompletion(block: CardanoBlock, tx: any){
  for(const input of tx.inputs){ 
    const txHash =  Buffer.from(input.txHash).toString('hex');
    const txIndex = input.outputIndex;
    const txBlock =  Number(block.header.height);
    const mintRequest = await mongo.collection("mintRequests").findOne({txHash, txIndex});
    if(mintRequest){
      console.log("completing mint request", txHash, txIndex, mintRequest)
      if(tx.mint && tx.mint.length > 0){
          mintRequest.state = requestState.completed;
          const mintTx = Buffer.from(tx.hash).toString('hex');
          const payments = tx.auxiliary.metadata[0]?.value.metadatum.case === "array" ? tx.auxiliary.metadata[0].value.metadatum.value.items.map((item) => 
            item.metadatum.case === "array" ? (item.metadatum.value.items[0].metadatum.value as string)   : undefined   
            )
            : [];
          await mongo.collection("mintRequests").updateOne({txHash, txIndex}, {$set: {state: requestState.completed , mintTx, payments}});
          return;
        }else{
          
          if( areUint8ArraysEqual(tx.outputs[0].address,Uint8ArrayAddress)){
            // Confescate the funds
            
            await mongo.collection("mintRequests").updateOne({txHash, txIndex}, {$set: {state: requestState.confescated}});
          }else{
            // reject
            await mongo.collection("mintRequests").updateOne({txHash, txIndex}, {$set: {state: requestState.rejected}});
          }
        }
    }
    const redemptionRequest = await mongo.collection("redemptionRequests").findOne({txHash, txIndex});
    if(redemptionRequest){
      if(tx.mint && tx.mint.length > 0){
        const burnTx = Buffer.from(tx.hash).toString('hex');
        await mongo.collection("redemptionRequests").updateOne({txHash, txIndex}, {$set: {state: requestState.completed, burnTx}});
        return;
      }else{
        await mongo.collection("redemptionRequests").updateOne({txHash, txIndex}, {$set: {state: requestState.rejected}});
      }
      console.log("completing redemption request", txHash, txIndex, redemptionRequest)
    }
   
  }
}



function convertAddressToBech32(byteArray: Uint8Array): string {

  const address = Lucid.C.Address.from_bytes(byteArray);
  const bech32Address = address.to_bech32("addr_test");
  return bech32Address;
}

function convertAddressToBytes(bech32Address: string): Uint8Array {
  const address = Lucid.C.Address.from_bech32(bech32Address);
  return address.to_bytes();
}

function areUint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
      return false;
  }
  for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
          return false;
      }
  }
  return true;
}

function toHexString(byteArray: Uint8Array): string {
  return Array.from(byteArray, (byte) => ('0' + (byte & 0xFF).toString(16)).slice(-2)).join('')
}
