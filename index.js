
import fs from "fs";
import got from "got";

const loadConfig = () => {
    const configFileContent = JSON.parse(fs.readFileSync("config.json", "utf-8"))
    const result = {
        stableCoinList: [],
        stableCoinInfoMap: [],
    }

    for (const stableCoinInfo of configFileContent["stableCoins"]) {
        result.stableCoinList.push(stableCoinInfo["symbol"])
        result.stableCoinInfoMap[stableCoinInfo["symbol"]] = stableCoinInfo
    }

    return result;
}

const getCoinQuote = (inputMint, outputMint, amount, slippageBps) =>
  got
    .get(
      `https://quote-api.jup.ag/v5/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`
    )
    .json();


const logWithTimestamp = (content) => console.log(`${new Date()} -- \n  ${content}`)
const getTimer = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const main = async () => {
  const config = loadConfig()
  const slippageBps = 10;

  const getBestTrade = async (inputSymbol, outputSymbol, amount) => {
    const {address: inputMint, decimals: inputDecimals} = config.stableCoinInfoMap[inputSymbol]
    const {address: outputMint, decimals: outputDecimals} = config.stableCoinInfoMap[outputSymbol]
    const inputAmountNormalized = Math.floor(amount * (10**inputDecimals))

    const bestTradeQuote = await getCoinQuote(inputMint, outputMint, inputAmountNormalized, slippageBps)
    bestTradeQuote.inputTokenPrice = (bestTradeQuote.outAmount / bestTradeQuote.inAmount) * 10**(inputDecimals - outputDecimals)
    bestTradeQuote.inAmount = bestTradeQuote.inAmount / (10**inputDecimals)
    bestTradeQuote.outAmount = bestTradeQuote.outAmount / (10**outputDecimals)
    return bestTradeQuote
  }

  const getOptimalTrade = async (inputSymbol, outputSymbol, startInputAmount, minInputBalance, networkFeeEstimate) => {
    let curTradeQuote = null
    let curGain = 0
    let curInputBalance = startInputAmount;

    while (curInputBalance > minInputBalance) {
      const prevTradeQuote = curTradeQuote
      curTradeQuote = await getBestTrade(inputSymbol, outputSymbol, curInputBalance);
      const prevGain = curGain;
      curGain = curTradeQuote.outAmount - curTradeQuote.inAmount - networkFeeEstimate;
      if (curGain < prevGain) {
        return prevTradeQuote
      }
      curInputBalance /= 2
    }
    return null
  }

  const startInputAmount = 1000;
  const mintInputAmount = 1;
  const networkFeeEstimate = 0.00001;
  const taskList = []

  for (const stableCoinIn of config.stableCoinList) {
    for (const stableCoinOut of config.stableCoinList) {
      if (stableCoinIn == stableCoinOut) {
        continue
      }
      taskList.push((async () => {
        while (true) {
          const timer = getTimer(10000);
          try {
            const optimalTrade = await getOptimalTrade(stableCoinIn, stableCoinOut, startInputAmount, mintInputAmount, networkFeeEstimate)
            if (!!optimalTrade) {
              logWithTimestamp(`sell ${stableCoinIn} for ${stableCoinOut} gain=${optimalTrade.outAmount - optimalTrade.inAmount}`)
            }
          } catch(e) {
            console.error(e)
          }
          finally {
            await timer;
          }
        }
      })())
    }
  }

  Promise.all(taskList)
}

await main()
