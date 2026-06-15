// 级数引擎 —— 数理农场的数学心脏
// 约定：n 从 1 开始。term(n) = 第 n 项，partialSum(n) = 前 n 项之和。
// 每种作物由 series_type + coef 唯一确定，部分和/极限/曲线全部由此推出，
// 数据库只需存 harvest_n（当前收到第几项）。

const factCache = [1] // factCache[k] = k!
function factorial(k) {
  for (let i = factCache.length; i <= k; i++) {
    factCache[i] = factCache[i - 1] * i
  }
  return factCache[k]
}

// 第 n 项（n ≥ 1）
export function term(type, coef, n) {
  switch (type) {
    case 'geometric':   return coef * Math.pow(0.5, n - 1)        // 10·(½)^(n-1)
    case 'harmonic':    return coef / n                           // 10/n
    case 'alternating': return coef * (n % 2 === 1 ? 1 : -1) / n  // (-1)^(n+1)·10/n
    case 'factorial':   return coef / factorial(n)               // 100/n!
    case 'leibniz':     return coef * (n % 2 === 1 ? 1 : -1) / (2 * n - 1) // (-1)^(n+1)·40/(2n-1)
    case 'basel':       return coef / (n * n)                    // 10/n²
    default:            return 0
  }
}

// 前 n 项部分和 Sₙ
export function partialSum(type, coef, n) {
  let s = 0
  for (let k = 1; k <= n; k++) s += term(type, coef, k)
  return s
}

// 理论极限（发散返回 Infinity）
export function limit(type, coef) {
  switch (type) {
    case 'geometric':   return coef / (1 - 0.5)        // = 2·coef = 20
    case 'harmonic':    return Infinity                 // 发散
    case 'alternating': return coef * Math.LN2          // 10·ln2 ≈ 6.93
    case 'factorial':   return coef * (Math.E - 1)      // 100(e-1) ≈ 171.83
    case 'leibniz':     return coef * Math.PI / 4       // 40·π/4 = 10π ≈ 31.42
    case 'basel':       return coef * Math.PI * Math.PI / 6 // 10·π²/6 ≈ 16.45
    default:            return NaN
  }
}

export function converges(type) {
  return type !== 'harmonic'
}

// 公式文本（用于界面展示）
export function formula(type, coef) {
  const c = formatNum(coef)
  switch (type) {
    case 'geometric':   return `aₙ = ${c}·(½)ⁿ⁻¹`
    case 'harmonic':    return `aₙ = ${c}/n`
    case 'alternating': return `aₙ = (-1)ⁿ⁺¹·${c}/n`
    case 'factorial':   return `aₙ = ${c}/n!`
    case 'leibniz':     return `aₙ = (-1)ⁿ⁺¹·${c}/(2n-1)`
    case 'basel':       return `aₙ = ${c}/n²`
    default:            return ''
  }
}

// 极限的符号化文本（带数值）
export function limitLabel(type, coef) {
  const L = limit(type, coef)
  switch (type) {
    case 'geometric':   return `${formatNum(L)}`
    case 'harmonic':    return `∞（发散）`
    case 'alternating': return `${formatNum(coef)}·ln2 ≈ ${L.toFixed(2)}`
    case 'factorial':   return `${formatNum(coef)}(e-1) ≈ ${L.toFixed(2)}`
    case 'leibniz':     return `${formatNum(coef / 4)}π ≈ ${L.toFixed(2)}`
    case 'basel':       return `${formatNum(coef)}·π²/6 ≈ ${L.toFixed(2)}`
    default:            return ''
  }
}

function formatNum(x) {
  return Number.isInteger(x) ? String(x) : String(Math.round(x * 100) / 100)
}
