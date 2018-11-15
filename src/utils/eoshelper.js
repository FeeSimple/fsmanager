import ecc from 'eosjs-ecc'
import { getResourceStr, beautifyBalance, fetchBalanceNumber } from './beautify'
import { NO_BALANCE } from './consts'

export const getKeyPair = async () => {
  let promises = [], keys = [], keyPairs = []
  promises.push(ecc.randomKey())

  let priv, pub
  keys = await Promise.all(promises)
  keyPairs = keys.map(k => {
    priv = k
    pub = ecc.privateToPublic(k)
  })

  return {pub, priv}
}

export const getRamPrice = async (eosClient) => {
  try {
    let result = await eosClient.getTableRows(true, 'eosio', 'eosio', 'rammarket')
    
    if (!result || !result.rows[0]) return null
    
    let ramMarketRow = result.rows[0]
    // console.log('ramMarketRow:', ramMarketRow)
    let quoteBalance = fetchBalanceNumber(ramMarketRow.quote.balance)
    let baseBalance = fetchBalanceNumber(ramMarketRow.base.balance)
    if (!quoteBalance || !baseBalance) return null
    let ramPrice = (quoteBalance / baseBalance) * 1000 // must be multiplied by 1000
    return ramPrice // XFS/KB
  } catch (err) {
    return null
  }
}

export const addRamPriceToRamStake = (stakedRam, ramPrice) => {
  ramPrice = ramPrice.toPrecision(1).toString()
  let res = stakedRam + ' ' + '(price: 1 KB costs ' + ramPrice + ' XFS)'
  return res
}

export const calcStakedRam = (ramPrice, ramQuota) => {
  let stakedRam = (ramQuota * ramPrice) / 1024
  if (stakedRam > 1) {  
    stakedRam = Intl.NumberFormat().format(stakedRam).toString() + ' XFS'
  } else {
    stakedRam = stakedRam.toPrecision(1).toString() + ' XFS'
  }
  //return stakedRam
  return addRamPriceToRamStake(stakedRam, ramPrice)
}

const remainingPercent = (used, max) => {
  const remaining = max - used
  return new Intl.NumberFormat().format(100 * (remaining / max)).toString()
}

export const createNewAccount = async (eosAdmin, accountName, eosAdminAccountName) => {
  const keyPair = await getKeyPair()
  const accountPubKey = keyPair.pub
  const accountPrivKey = keyPair.priv
  try {
    const result = await eosAdmin.transaction(tr => {
      tr.newaccount({
          creator: eosAdminAccountName,
          name: accountName,
          owner: accountPubKey,
          active: accountPubKey
      });
  
      tr.buyrambytes({
          payer: eosAdminAccountName,
          receiver: accountName,
          bytes: 10240
      });
  
      tr.delegatebw({
          from: eosAdminAccountName,
          receiver: accountName,
          stake_net_quantity: '10.0000 XFS', // for "delegatebw", there must be exactly 4 decimal places
          stake_cpu_quantity: '10.0000 XFS', // Otherwise, it will never work
          transfer: 1
      });
    })

    return {accountPubKey, accountPrivKey}
  } catch (err) {
    // Without JSON.parse(), it never works!
    err = JSON.parse(err)
    const errMsg = (err.error.what || "Account creation failed")
    
    return {errMsg}
  }
}

// For managing resource, the XFS amount must have exactly 4 decimal places
// Otherwise, it won't work
export const conformXfsAmount = (xfsAmount) => {
  return parseFloat(xfsAmount).toFixed(4).toString() + ' XFS'
}

export const manageCpuBw = async (eosClient, activeAccount, xfsAmount, isCpu, isStake) => {
  try {
    let result = null

    xfsAmount = conformXfsAmount(xfsAmount)
    const zeroAmount = conformXfsAmount(0)
    console.log('xfsAmount:', xfsAmount);

    // VIP: no matter cpu and bandwidth, must always specify both "_cpu_quantity" and "_net_quantity"
    if (isCpu) {
      if (isStake) {
        // Stake CPU
        result = await eosClient.transaction(tr => {
          tr.delegatebw({
            from: activeAccount,
            receiver: activeAccount,
            stake_cpu_quantity: xfsAmount,
            stake_net_quantity: zeroAmount,
            transfer: 0 // for staking, "transfer" must be 0
          });
        })
      } else {
        // Unstake CPU
        result = await eosClient.transaction(tr => {
          tr.undelegatebw({
            from: activeAccount,
            receiver: activeAccount,
            unstake_cpu_quantity: xfsAmount,
            unstake_net_quantity: zeroAmount,
            transfer: 1 // for unstaking, "transfer" can be 0
          });
        })
      }
    } else {
      if (isStake) {
        // Stake Bw
        result = await eosClient.transaction(tr => {
          tr.delegatebw({
            from: activeAccount,
            receiver: activeAccount,
            stake_cpu_quantity: zeroAmount,
            stake_net_quantity: xfsAmount,
            transfer: 0 // for staking, "transfer" must be 0
          });
        })
      } else {
        // Unstake Bw
        result = await eosClient.transaction(tr => {
          tr.undelegatebw({
            from: activeAccount,
            receiver: activeAccount,
            unstake_cpu_quantity: zeroAmount,
            unstake_net_quantity: xfsAmount,
            transfer: 1 // for unstaking, "transfer" can be 0
          });
        })
      }
    }

    // refund still doesn't work
    // if (!isStake) {
    //   let res = await refundStake(eosClient, activeAccount)
    //   if (res.errMsg) {
    //     console.log('manageCpuBw - error:', res.errMsg);
    //   } else {
    //     console.log('manageCpuBw - OK');
    //   }
    // }

    return {}
  } catch (err) {
    // Without JSON.parse(), it never works!
    // err = JSON.parse(err)
    // const errMsg = (err.error.what || "Resource management failed")
    const errMsg = "Resource management failed"
    
    return {errMsg}
  }
}

export const xfs2RamBytes = (xfsAmount, ramPrice) => {
  let res = parseFloat(xfsAmount) / parseFloat(ramPrice)
  res = res * 1024 // bytes
  return parseInt(res).toString()
}

export const refundStake = async (eosClient, activeAccount) => {
  try {
    await eosClient.transaction(tr => {
      tr.refund({
        cpu_amount: "0.2000 XFS",
        net_amount: "0.2000 XFS",
        owner: activeAccount  
      });
    })
    
    return {}
  } catch (err) {
    // Without JSON.parse(), it never works!
    // err = JSON.parse(err)
    // const errMsg = (err.error.what || "RAM management failed")
    const errMsg = "Refund failed"
    
    return {errMsg}
  }
}

export const manageRam = async (eosClient, activeAccount, xfsAmount, ramPrice, isBuy) => {
  try {
    
    if (isBuy) {
      xfsAmount = conformXfsAmount(xfsAmount)
      console.log('manageRam: xfsAmount:', xfsAmount);

      await eosClient.transaction(tr => {
        // "buyrambytes()" is used to buy RAM in bytes
        // "buyram()" is used to buy RAM in XFS
        tr.buyram({
            payer: activeAccount,
            receiver: activeAccount,
            quant: xfsAmount
        });
      })
    } else {
      let ramBytes = xfs2RamBytes(xfsAmount, ramPrice)
      await eosClient.transaction(tr => {
        // "buyrambytes()" is used to buy RAM in bytes
        // "buyram()" is used to buy RAM in XFS
        tr.sellram({
            account: activeAccount, // account selling RAM
            bytes: ramBytes
        });
      })
    }
    return {}
  } catch (err) {
    // Without JSON.parse(), it never works!
    // err = JSON.parse(err)
    // const errMsg = (err.error.what || "RAM management failed")
    const errMsg = "RAM management failed"
    
    return {errMsg}
  }
}

export const checkAccount = async (eosClient, account) => {
  try {
    await eosClient.getAccount(account)
    
    return true

  } catch (err) {

    return false
  }
}

export const getAccountInfo = async (eosClient, account) => {
  try {
    let result = await eosClient.getAccount(account)
    console.log('getAccountInfo - result: ', result)
    let ramStr = ''
    let ramMeter = '0'
    if (result.ram_usage && result.ram_quota) {
      ramStr = getResourceStr({used: result.ram_usage, max: result.ram_quota})
      ramMeter = remainingPercent(result.ram_usage, result.ram_quota).toString()
    }
    
    let bandwidthStr = ''
    let bandwidthMeter = '0'
    if (result.net_limit) {
      bandwidthStr = getResourceStr(result.net_limit)
      bandwidthMeter = remainingPercent(result.net_limit.used, result.net_limit.max).toString()
    }
    
    let cpuStr = ''
    let cpuMeter = '0'
    if (result.cpu_limit) {
      cpuStr = getResourceStr(result.cpu_limit, true)
      cpuMeter = remainingPercent(result.cpu_limit.used, result.cpu_limit.max).toString()
    }

    // If user has no balance, the field "core_liquid_balance" won't exist!
    let balance = beautifyBalance(result.core_liquid_balance)

    let created = result.created
    let idx = created.indexOf('T') // cut away the time trailing
    created = created.substring(0, idx != -1 ? idx : created.length);
    
    let pubkey = result.permissions[0].required_auth.keys[0].key

    let stakedCpu = NO_BALANCE
    let stakedBandwidth = NO_BALANCE
    if (result.total_resources) {
      stakedCpu = beautifyBalance(result.total_resources.cpu_weight)
      stakedBandwidth = beautifyBalance(result.total_resources.net_weight)
    }

    let info = {
      account,
      created,
      balance,
      ramStr,
      ramMeter,
      bandwidthStr,
      bandwidthMeter,
      stakedBandwidth,
      cpuStr,
      cpuMeter,
      stakedCpu,
      pubkey
    }

    let stakedRam = NO_BALANCE

    if (result.ram_quota) {
      let ramPrice = await getRamPrice(eosClient)
      if (ramPrice) {  
        stakedRam = calcStakedRam(ramPrice, result.ram_quota)
        info.ramPrice = ramPrice
      }
    }

    info.stakedRam = stakedRam
    
    return info

  } catch (err) {

    console.log('getAccountInfo (' + account + ') error: ', err)

    return null
  }
}

export const checkAccountNameError = (accountName) => {
  let errMsg = null
  const accountRegex = /^[a-z1-5]*$/
  if (!accountName) {
    errMsg = 'Required'
  } else if (accountName.length !== 12) {
    errMsg = 'Must be 12 symbols long'
  } else if (!accountRegex.test(accountName)) {
    errMsg = 'Must include symbols a-z 1-5'
  } else {
  }
  return errMsg
}

export const checkXfsAmountError = (xfsAmount) => {
  let errMsg = null
  if (!xfsAmount) {
    errMsg = 'Required'
  } else if (xfsAmount <= 0) {
      errMsg = 'Must be positive'
  }
  return errMsg
}