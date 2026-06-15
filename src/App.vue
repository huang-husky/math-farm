<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { term, limit, converges, formula, limitLabel } from './series'

const API = 'http://47.109.20.156:3000/api'

const CROP_EMOJI = {
  '几何草莓': '🍓', '调和玉米': '🌽', '交错西瓜': '🍉',
  'π葡萄': '🍇', '阶乘南瓜': '🎃', '欧拉向日葵': '🌻'
}

const token = ref(localStorage.getItem('farm_token') || '')
const username = ref(localStorage.getItem('farm_username') || '')
const coins = ref(0)
const level = ref(1)
const exp = ref(0)
const plots = ref([])
const crops = ref([])
const message = ref('')
const msgType = ref('ok')

const loginForm = ref({ username: '', password: '' })
const registerForm = ref({ username: '', password: '' })
const tab = ref('login')
const loading = ref(false)

const pickerOpen = ref(false)
const pickerSlot = ref(null)

const detailOpen = ref(false)
const detailSlot = ref(null)

const view = ref('farm')

const friends = ref([])
const addName = ref('')
const stealLogs = ref([])
const visitUser = ref(null)
const visitFriendId = ref(null)
const visitPlots = ref([])
const mySteals = ref([])

const now = ref(Date.now())
let timer = null

async function request(path, options = {}) {
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token.value ? { Authorization: 'Bearer ' + token.value } : {}),
      ...(options.headers || {})
    }
  })
  return res.json()
}

async function login() {
  loading.value = true
  const data = await request('/auth/login', { method: 'POST', body: JSON.stringify(loginForm.value) })
  loading.value = false
  if (data.error) return showMsg(data.error, 'err')
  token.value = data.token
  username.value = data.username
  localStorage.setItem('farm_token', data.token)
  localStorage.setItem('farm_username', data.username)
  await loadFarm()
  showMsg('欢迎回来，' + data.username)
}

async function register() {
  if (!registerForm.value.username || !registerForm.value.password)
    return showMsg('用户名和密码不能为空', 'err')
  loading.value = true
  const data = await request('/auth/register', { method: 'POST', body: JSON.stringify(registerForm.value) })
  loading.value = false
  if (data.error) return showMsg(data.error, 'err')
  showMsg('注册成功，请登录')
  loginForm.value.username = registerForm.value.username
  tab.value = 'login'
}

async function loadFarm() {
  const data = await request('/farm/my')
  if (data.error) return
  plots.value = data.plots
  coins.value = data.user.coins
  level.value = data.user.level
  exp.value = data.user.exp
  crops.value = await request('/farm/crops')
}

function openPicker(slot) { pickerSlot.value = slot; pickerOpen.value = true }
function openDetail(slot) { detailSlot.value = slot; detailOpen.value = true }

async function plant(cropId) {
  const slot = pickerSlot.value
  pickerOpen.value = false
  const data = await request('/farm/plant', { method: 'POST', body: JSON.stringify({ slot, crop_id: cropId }) })
  showMsg(data.message || data.error, data.error ? 'err' : 'ok')
  await loadFarm()
}

async function harvest(slot) {
  const data = await request('/farm/harvest', { method: 'POST', body: JSON.stringify({ slot }) })
  showMsg(data.message || data.error, data.error ? 'err' : 'ok')
  await loadFarm()
}

async function clearPlot(slot) {
  const data = await request('/farm/clear', { method: 'POST', body: JSON.stringify({ slot }) })
  detailOpen.value = false
  showMsg(data.message || data.error, data.error ? 'err' : 'ok')
  await loadFarm()
}

function onPlotClick(plot) {
  if (plot.status === 'empty') return openPicker(plot.slot)
  if (isReady(plot)) return harvest(plot.slot)
  return openDetail(plot.slot)
}

function logout() {
  token.value = ''; username.value = ''; plots.value = []; view.value = 'farm'
  localStorage.removeItem('farm_token'); localStorage.removeItem('farm_username')
}

function showMsg(msg, type = 'ok') {
  message.value = msg; msgType.value = type
  setTimeout(() => message.value = '', 2800)
}

function isReady(plot) {
  if (plot.status === 'empty') return false
  return now.value >= new Date(plot.ready_at).getTime()
}
function remainSec(plot) { return Math.max(0, Math.ceil((new Date(plot.ready_at).getTime() - now.value) / 1000)) }
function fmtTime(sec) {
  if (sec >= 3600) return Math.floor(sec / 3600) + '小时' + Math.floor((sec % 3600) / 60) + '分'
  if (sec >= 60) return Math.floor(sec / 60) + '分' + (sec % 60) + '秒'
  return sec + '秒'
}
function growthRatio(plot) {
  if (plot.status === 'empty') return 0
  const ready = new Date(plot.ready_at).getTime()
  const planted = new Date(plot.planted_at).getTime()
  const total = ready - planted
  if (total <= 0) return 1
  return Math.min(1, Math.max(0, (now.value - planted) / total))
}
function plotEmoji(plot) {
  if (plot.status === 'empty') return '🟫'
  if (isReady(plot)) return CROP_EMOJI[plot.crop_name] || '🌟'
  return growthRatio(plot) < 0.5 ? '🌱' : '🌿'
}
function plotState(plot) {
  if (plot.status === 'empty') return 'empty'
  if (isReady(plot)) return 'ready'
  return 'growing'
}

// ---------- 级数曲线 ----------
// 计算 S_1..S_n
function sumsOf(plot) {
  if (!plot.series_type || !plot.harvest_n) return []
  const c = Number(plot.coef)
  const arr = []; let s = 0
  for (let k = 1; k <= plot.harvest_n; k++) { s += term(plot.series_type, c, k); arr.push(s) }
  return arr
}
// 生成 SVG 折线图数据
function chart(plot, w, h) {
  const pad = 6
  const sums = sumsOf(plot)
  const L = plot.series_type ? limit(plot.series_type, Number(plot.coef)) : NaN
  const finiteL = Number.isFinite(L)
  const all = [...sums]
  if (finiteL) all.push(L)
  let yMin = 0, yMax = 1
  if (all.length) { yMin = Math.min(0, ...all); yMax = Math.max(...all) }
  if (yMax === yMin) yMax = yMin + 1
  const n = sums.length
  const xFor = i => pad + (n <= 1 ? (w - 2 * pad) / 2 : (i / (n - 1)) * (w - 2 * pad))
  const yFor = v => h - pad - ((v - yMin) / (yMax - yMin)) * (h - 2 * pad)
  const path = sums.map((v, i) => (i === 0 ? 'M' : 'L') + xFor(i).toFixed(1) + ' ' + yFor(v).toFixed(1)).join(' ')
  const pts = sums.map((v, i) => ({ x: xFor(i), y: yFor(v) }))
  return { path, pts, limitY: finiteL ? yFor(L) : null, sums, L, finiteL, w, h }
}

const cards = computed(() => plots.value.map(p => {
  const spark = chart(p, 120, 34)
  return { plot: p, spark, lastSum: spark.sums.length ? spark.sums[spark.sums.length - 1] : null }
}))

const detailPlot = computed(() => detailOpen.value ? plots.value.find(p => p.slot === detailSlot.value) : null)
const bigChart = computed(() => detailPlot.value ? chart(detailPlot.value, 440, 220) : null)
const detailInfo = computed(() => {
  const p = detailPlot.value
  if (!p || !p.series_type) return null
  const c = Number(p.coef)
  const L = limit(p.series_type, c)
  const sums = sumsOf(p)
  const last = sums.length ? sums[sums.length - 1] : 0
  return {
    formula: formula(p.series_type, c),
    limitLabel: limitLabel(p.series_type, c),
    converges: converges(p.series_type),
    n: p.harvest_n,
    last,
    dist: Number.isFinite(L) ? Math.abs(L - last) : null
  }
})

const expMax = computed(() => level.value * 100)

// ---------- 社交 ----------
async function goSocial() { view.value = 'social'; await loadFriends(); await loadLogs() }
async function loadFriends() { friends.value = await request('/social/friends') }
async function loadLogs() { stealLogs.value = await request('/social/logs') }
async function addFriend() {
  if (!addName.value.trim()) return
  const data = await request('/social/add', { method: 'POST', body: JSON.stringify({ username: addName.value.trim() }) })
  showMsg(data.message || data.error, data.error ? 'err' : 'ok')
  if (!data.error) { addName.value = ''; await loadFriends() }
}
async function visitFarm(friend) {
  const data = await request('/social/farm/' + friend.id)
  if (data.error) return showMsg(data.error, 'err')
  visitUser.value = data.user; visitFriendId.value = friend.id
  visitPlots.value = data.plots; mySteals.value = data.mySteals || []
  view.value = 'visit'
}
function alreadyStolen(plot) {
  return mySteals.value.some(s => s.plot_id === plot.id && new Date(s.planted_at).getTime() === new Date(plot.planted_at).getTime())
}
function canSteal(plot) { return plot.status !== 'empty' && isReady(plot) && !alreadyStolen(plot) }
async function steal(plot) {
  const data = await request('/social/steal', { method: 'POST', body: JSON.stringify({ friendId: visitFriendId.value, slot: plot.slot }) })
  showMsg(data.message || data.error, data.error ? 'err' : 'ok')
  if (!data.error) { coins.value += data.reward; await visitFarm({ id: visitFriendId.value }) }
}
function fmtDate(s) {
  const d = new Date(s)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

onMounted(() => {
  if (token.value) loadFarm()
  timer = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => clearInterval(timer))
</script>

<template>
  <div class="page">
    <div class="card">
      <h1 class="title">📐 数理农场</h1>
      <p class="tagline">CONVERGENCE FARM · 在土里种下无穷级数</p>

      <!-- 未登录 -->
      <div v-if="!token" class="auth">
        <div class="tabs">
          <button :class="{ active: tab === 'login' }" @click="tab = 'login'">登录</button>
          <button :class="{ active: tab === 'register' }" @click="tab = 'register'">注册</button>
        </div>
        <form v-if="tab === 'login'" class="form" @submit.prevent="login">
          <input v-model="loginForm.username" placeholder="用户名" />
          <input v-model="loginForm.password" type="password" placeholder="密码" />
          <button type="submit" :disabled="loading">{{ loading ? '登录中…' : '进入农场' }}</button>
        </form>
        <form v-else class="form" @submit.prevent="register">
          <input v-model="registerForm.username" placeholder="起个用户名" />
          <input v-model="registerForm.password" type="password" placeholder="设置密码" />
          <button type="submit" :disabled="loading">{{ loading ? '注册中…' : '注册账号' }}</button>
        </form>
      </div>

      <!-- 已登录 -->
      <div v-else class="game">
        <div class="status">
          <div class="user">
            <span class="avatar">👤</span>
            <div class="uinfo"><div class="uname">{{ username }}</div><div class="ulevel">Lv.{{ level }}</div></div>
          </div>
          <div class="coins">🪙 {{ coins }}</div>
          <button class="logout" @click="logout">退出</button>
        </div>

        <div class="expbar">
          <div class="expfill" :style="{ width: Math.min(100, exp / expMax * 100) + '%' }"></div>
          <span class="exptext">EXP {{ exp }} / {{ expMax }}</span>
        </div>

        <div class="nav">
          <button :class="{ active: view === 'farm' }" @click="view = 'farm'; loadFarm()">🌾 我的农场</button>
          <button :class="{ active: view === 'social' || view === 'visit' }" @click="goSocial">👥 好友互动</button>
        </div>

        <!-- 我的农场 -->
        <div v-if="view === 'farm'" class="plots">
          <div v-for="card in cards" :key="card.plot.slot" class="plot" :class="plotState(card.plot)" @click="onPlotClick(card.plot)">
            <button v-if="card.plot.status !== 'empty'" class="chart-btn" @click.stop="openDetail(card.plot.slot)">📈</button>
            <div class="emoji">{{ plotEmoji(card.plot) }}</div>
            <div class="pname" v-if="card.plot.status !== 'empty'">{{ card.plot.crop_name }}</div>
            <div class="pname empty" v-else>空地 · 点击播种</div>

            <template v-if="card.plot.status !== 'empty'">
              <div v-if="card.plot.harvest_n > 0" class="harvest-n">已收 {{ card.plot.harvest_n }} 项 · S≈{{ card.lastSum.toFixed(2) }}</div>
              <svg v-if="card.plot.harvest_n > 0" class="spark" :viewBox="`0 0 ${card.spark.w} ${card.spark.h}`">
                <line v-if="card.spark.limitY !== null" :x1="0" :y1="card.spark.limitY" :x2="card.spark.w" :y2="card.spark.limitY" class="spark-limit" />
                <path :d="card.spark.path" class="spark-line" />
                <circle v-if="card.spark.pts.length" :cx="card.spark.pts[card.spark.pts.length - 1].x" :cy="card.spark.pts[card.spark.pts.length - 1].y" r="2.5" class="spark-dot" />
              </svg>
              <div class="pstatus ready-text" v-if="plotState(card.plot) === 'ready'">✨ 收第 {{ card.plot.harvest_n + 1 }} 项</div>
              <div class="pstatus" v-else>⏳ {{ fmtTime(remainSec(card.plot)) }}</div>
            </template>
          </div>
        </div>

        <!-- 好友互动 -->
        <div v-else-if="view === 'social'" class="social">
          <div class="add-friend">
            <input v-model="addName" placeholder="输入好友用户名" @keyup.enter="addFriend" />
            <button @click="addFriend">加好友</button>
          </div>
          <h3 class="sub">我的好友</h3>
          <div v-if="friends.length === 0" class="empty-tip">还没有好友，加一个去他农场偷菜吧 😏</div>
          <div v-else class="friend-list">
            <div v-for="f in friends" :key="f.id" class="friend">
              <span class="favatar">👤</span>
              <div class="finfo"><div class="fname">{{ f.username }}</div><div class="flevel">Lv.{{ f.level }}</div></div>
              <button class="visit-btn" @click="visitFarm(f)">进农场 🚜</button>
            </div>
          </div>
          <h3 class="sub">被偷记录</h3>
          <div v-if="stealLogs.length === 0" class="empty-tip">暂时没人偷你的菜，安全 🛡️</div>
          <div v-else class="log-list">
            <div v-for="(l, i) in stealLogs" :key="i" class="log">
              <span>😈 <b>{{ l.stealer }}</b> 偷走了你的 {{ l.crop_name }}</span>
              <span class="ltime">{{ fmtDate(l.stolen_at) }}</span>
            </div>
          </div>
        </div>

        <!-- 好友农场 -->
        <div v-else-if="view === 'visit'" class="visit">
          <div class="visit-head">
            <button class="back" @click="goSocial">← 返回</button>
            <span class="visit-title">{{ visitUser.username }} 的农场（Lv.{{ visitUser.level }}）</span>
          </div>
          <div class="plots">
            <div v-for="(plot, i) in visitPlots" :key="i" class="plot" :class="[plotState(plot), { stealable: canSteal(plot) }]">
              <div class="emoji">{{ plotEmoji(plot) }}</div>
              <div class="pname" v-if="plot.status !== 'empty'">{{ plot.crop_name }}</div>
              <div class="pname empty" v-else>空地</div>
              <div class="pstatus" v-if="plotState(plot) === 'growing'">⏳ {{ fmtTime(remainSec(plot)) }}</div>
              <button v-if="canSteal(plot)" class="steal-btn" @click="steal(plot)">偷它 😈</button>
              <div v-else-if="plot.status !== 'empty' && isReady(plot)" class="stolen-tag">已偷过</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 作物选择弹窗 -->
    <div v-if="pickerOpen" class="modal-mask" @click.self="pickerOpen = false">
      <div class="modal">
        <h3>选择级数作物</h3>
        <div class="crop-list">
          <button v-for="c in crops" :key="c.id" class="crop-item" :disabled="c.level_required > level" @click="plant(c.id)">
            <span class="cemoji">{{ CROP_EMOJI[c.name] || '🌱' }}</span>
            <div class="cmain">
              <div class="cname">{{ c.name }}</div>
              <div class="cformula">{{ formula(c.series_type, Number(c.coef)) }}</div>
              <div class="climit" :class="{ diverge: !converges(c.series_type) }">→ {{ limitLabel(c.series_type, Number(c.coef)) }}</div>
            </div>
            <span v-if="c.level_required > level" class="clock">🔒 Lv.{{ c.level_required }}</span>
          </button>
        </div>
        <button class="close" @click="pickerOpen = false">取消</button>
      </div>
    </div>

    <!-- 地块详情 + 大曲线 -->
    <div v-if="detailOpen && detailPlot && detailInfo" class="modal-mask" @click.self="detailOpen = false">
      <div class="modal detail">
        <div class="detail-head">
          <span class="detail-emoji">{{ CROP_EMOJI[detailPlot.crop_name] || '🌱' }}</span>
          <div>
            <div class="detail-name">{{ detailPlot.crop_name }}</div>
            <div class="detail-formula">{{ detailInfo.formula }}</div>
          </div>
        </div>

        <div class="chart-box">
          <svg :viewBox="`0 0 ${bigChart.w} ${bigChart.h}`" class="bigsvg">
            <line v-if="bigChart.limitY !== null" :x1="0" :y1="bigChart.limitY" :x2="bigChart.w" :y2="bigChart.limitY" class="big-limit" />
            <path v-if="bigChart.path" :d="bigChart.path" class="big-line" />
            <circle v-for="(p, i) in bigChart.pts" :key="i" :cx="p.x" :cy="p.y" :r="i === bigChart.pts.length - 1 ? 4 : 2.5"
              :class="i === bigChart.pts.length - 1 ? 'big-dot-last' : 'big-dot'" />
          </svg>
          <div v-if="bigChart.limitY !== null" class="limit-tag" :style="{ top: (bigChart.limitY / bigChart.h * 100) + '%' }">极限</div>
        </div>

        <div class="detail-stats">
          <div class="stat"><div class="sk">已收</div><div class="sv">{{ detailInfo.n }} 项</div></div>
          <div class="stat"><div class="sk">部分和 Sₙ</div><div class="sv">{{ detailInfo.last.toFixed(3) }}</div></div>
          <div class="stat"><div class="sk">极限</div><div class="sv" :class="{ diverge: !detailInfo.converges }">{{ detailInfo.limitLabel }}</div></div>
          <div class="stat" v-if="detailInfo.dist !== null"><div class="sk">距极限</div><div class="sv">{{ detailInfo.dist.toFixed(3) }}</div></div>
          <div class="stat" v-else><div class="sk">状态</div><div class="sv diverge">发散 ↗</div></div>
        </div>

        <div class="detail-actions">
          <button v-if="isReady(detailPlot)" class="harvest-act" @click="harvest(detailPlot.slot)">🌟 收第 {{ detailInfo.n + 1 }} 项</button>
          <button v-else class="harvest-act disabled" disabled>⏳ {{ fmtTime(remainSec(detailPlot)) }} 后可收</button>
          <button class="clear-act" @click="clearPlot(detailPlot.slot)">🗑️ 铲平</button>
        </div>
        <button class="close" @click="detailOpen = false">关闭</button>
      </div>
    </div>

    <transition name="toast">
      <div v-if="message" class="toast" :class="msgType">{{ message }}</div>
    </transition>
  </div>
</template>

<style scoped>
* { box-sizing: border-box; }
.page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px;
  font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
  background-color: #d9ebca;
  background-image:
    linear-gradient(rgba(255,255,255,.45), rgba(255,255,255,0)),
    linear-gradient(rgba(76,175,80,.10) 1px, transparent 1px),
    linear-gradient(90deg, rgba(76,175,80,.10) 1px, transparent 1px);
  background-size: 100% 100%, 26px 26px, 26px 26px; }
.card { width: 100%; max-width: 660px; background: rgba(255,255,255,.97); border-radius: 28px; padding: 34px;
  box-shadow: 0 24px 70px rgba(31,94,32,.22); border: 1px solid rgba(76,175,80,.18); }
.title { text-align: center; font-size: 32px; margin: 0; color: #2e7d32; letter-spacing: 2px; font-weight: 800; }
.tagline { text-align: center; font-size: 12px; color: #8aa888; margin: 4px 0 26px; letter-spacing: 2px; font-family: 'Courier New', monospace; }

.tabs { display: flex; gap: 8px; justify-content: center; margin-bottom: 20px; }
.tabs button { padding: 8px 24px; border: none; border-radius: 999px; cursor: pointer; background: #eee; color: #666; font-size: 15px; transition: .2s; }
.tabs button.active { background: #4caf50; color: #fff; }
.form { display: flex; flex-direction: column; gap: 12px; max-width: 300px; margin: 0 auto; }
.form input { padding: 12px 14px; border: 2px solid #e0e0e0; border-radius: 12px; font-size: 15px; transition: border .2s; }
.form input:focus { outline: none; border-color: #4caf50; }
.form button { padding: 12px; background: #4caf50; color: #fff; border: none; border-radius: 12px; font-size: 16px; cursor: pointer; transition: .2s; }
.form button:hover:not(:disabled) { background: #43a047; }
.form button:disabled { opacity: .6; cursor: default; }

.status { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.user { display: flex; align-items: center; gap: 10px; flex: 1; }
.avatar { font-size: 22px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: #e8f5e9; border-radius: 50%; }
.uname { font-weight: 600; color: #333; }
.ulevel { font-size: 12px; color: #888; }
.coins { background: linear-gradient(180deg,#fff8e1,#ffecb3); color: #f57f17; padding: 8px 18px; border-radius: 999px; font-weight: 700; font-size: 16px; box-shadow: 0 2px 6px rgba(245,127,23,.18); }
.logout { padding: 8px 14px; border: 1px solid #ddd; background: #fff; border-radius: 999px; cursor: pointer; color: #888; font-size: 13px; }

.expbar { position: relative; height: 18px; background: #eceff1; border-radius: 999px; overflow: hidden; margin-bottom: 20px; }
.expfill { height: 100%; background: linear-gradient(90deg, #66bb6a, #43a047); border-radius: 999px; transition: width .4s; }
.exptext { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #555; font-weight: 600; }

.nav { display: flex; gap: 8px; margin-bottom: 20px; }
.nav button { flex: 1; padding: 11px; border: none; border-radius: 14px; background: #eef5e6; color: #558b2f; font-size: 15px; font-weight: 600; cursor: pointer; transition: .2s; }
.nav button:hover { background: #e3efd6; }
.nav button.active { background: linear-gradient(180deg,#56b85a,#43a047); color: #fff; box-shadow: 0 4px 12px rgba(67,160,71,.3); }

.plots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.plot { border-radius: 18px; padding: 16px 10px; cursor: pointer; text-align: center; border: 2px solid transparent; transition: transform .18s, box-shadow .18s; min-height: 158px; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; overflow: hidden; }
.plot::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 20px; background: rgba(0,0,0,.045); }
.plot:hover { transform: translateY(-4px); box-shadow: 0 12px 26px rgba(31,94,32,.16); }
.plot.empty { background: repeating-linear-gradient(95deg,#ecd9bd,#ecd9bd 11px,#e6cfae 11px,#e6cfae 22px); border-color: #dcc39c; }
.plot.growing { background: linear-gradient(180deg,#fffef3,#f1f8d6); border-color: #d4e59a; }
.plot.ready { background: linear-gradient(180deg,#eafbe9,#d3f2cf); border-color: #66bb6a; animation: pulse 1.4s infinite; }
.plot.stealable { animation: pulseRed 1.4s infinite; cursor: default; }
@keyframes pulse { 0%,100% { box-shadow: 0 0 0 0 rgba(102,187,106,.5); } 50% { box-shadow: 0 0 0 8px rgba(102,187,106,0); } }
@keyframes pulseRed { 0%,100% { box-shadow: 0 0 0 0 rgba(229,57,53,.5); } 50% { box-shadow: 0 0 0 8px rgba(229,57,53,0); } }
.chart-btn { position: absolute; top: 6px; right: 6px; border: none; background: rgba(255,255,255,.7); border-radius: 8px; cursor: pointer; font-size: 13px; padding: 2px 5px; line-height: 1; }
.chart-btn:hover { background: #fff; }
.emoji { font-size: 34px; line-height: 1; width: 58px; height: 58px; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 38%, rgba(255,255,255,.95), rgba(255,255,255,.25)); border-radius: 50%;
  box-shadow: 0 3px 8px rgba(0,0,0,.10); position: relative; z-index: 1; }
.pname { margin-top: 8px; font-weight: 600; color: #444; font-size: 14px; position: relative; z-index: 1; }
.pname.empty { color: #9c7f55; font-weight: 600; font-size: 13px; }
.harvest-n { font-size: 11px; color: #777; margin-top: 4px; position: relative; z-index: 1; }
.spark { width: 100%; height: 30px; margin-top: 4px; position: relative; z-index: 1; }
.spark-line { fill: none; stroke: #43a047; stroke-width: 1.6; }
.spark-limit { stroke: #e53935; stroke-width: 1; stroke-dasharray: 3 3; opacity: .6; }
.spark-dot { fill: #2e7d32; }
.pstatus { margin-top: 6px; font-size: 12px; color: #888; position: relative; z-index: 1; }
.ready-text { color: #2e7d32; font-weight: 700; }

/* 社交 */
.add-friend { display: flex; gap: 8px; margin-bottom: 20px; }
.add-friend input { flex: 1; padding: 10px 14px; border: 2px solid #e0e0e0; border-radius: 12px; font-size: 14px; }
.add-friend input:focus { outline: none; border-color: #4caf50; }
.add-friend button { padding: 10px 20px; border: none; border-radius: 12px; background: #4caf50; color: #fff; cursor: pointer; }
.sub { margin: 18px 0 10px; color: #555; font-size: 15px; }
.empty-tip { color: #aaa; font-size: 14px; padding: 12px; background: #fafafa; border-radius: 12px; text-align: center; }
.friend-list { display: flex; flex-direction: column; gap: 10px; }
.friend { display: flex; align-items: center; gap: 12px; padding: 12px 14px; background: #f9fbf7; border: 1px solid #e8f0e0; border-radius: 14px; }
.favatar { font-size: 20px; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; background: #e8f5e9; border-radius: 50%; }
.fname { font-weight: 600; color: #333; }
.flevel { font-size: 12px; color: #888; }
.finfo { flex: 1; }
.visit-btn { padding: 8px 16px; border: none; border-radius: 999px; background: #66bb6a; color: #fff; cursor: pointer; font-size: 13px; }
.log-list { display: flex; flex-direction: column; gap: 8px; }
.log { display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: #fff5f5; border-radius: 12px; font-size: 13px; color: #555; }
.ltime { color: #aaa; font-size: 12px; }
.visit-head { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; }
.back { padding: 8px 14px; border: 1px solid #ddd; background: #fff; border-radius: 999px; cursor: pointer; color: #666; }
.visit-title { font-weight: 600; color: #333; }
.steal-btn { margin-top: 8px; padding: 6px 14px; border: none; border-radius: 999px; background: #e53935; color: #fff; cursor: pointer; font-size: 13px; }
.stolen-tag { margin-top: 8px; font-size: 12px; color: #aaa; }

/* 弹窗通用 */
.modal-mask { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
.modal { background: #fff; border-radius: 20px; padding: 24px; width: 100%; max-width: 360px; }
.modal h3 { margin: 0 0 16px; text-align: center; color: #333; }
.crop-list { display: flex; flex-direction: column; gap: 10px; }
.crop-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 2px solid #eee; border-radius: 12px; background: #fafafa; cursor: pointer; transition: .15s; text-align: left; }
.crop-item:hover:not(:disabled) { border-color: #4caf50; background: #f1f8e9; }
.crop-item:disabled { opacity: .5; cursor: not-allowed; }
.cemoji { font-size: 28px; }
.cmain { flex: 1; }
.cname { font-weight: 600; color: #333; }
.cformula { font-family: 'Courier New', monospace; font-size: 12px; color: #666; margin-top: 2px; }
.climit { font-size: 12px; color: #2e7d32; margin-top: 2px; }
.climit.diverge { color: #e53935; }
.clock { font-size: 12px; color: #c62828; }
.close { width: 100%; margin-top: 16px; padding: 10px; border: none; border-radius: 12px; background: #eee; color: #666; cursor: pointer; }

/* 详情大图 */
.modal.detail { max-width: 480px; }
.detail-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.detail-emoji { font-size: 36px; }
.detail-name { font-size: 18px; font-weight: 700; color: #2e7d32; }
.detail-formula { font-family: 'Courier New', monospace; font-size: 13px; color: #666; margin-top: 2px; }
.chart-box { position: relative; background: #fafdf9; border: 1px solid #e8f0e8; border-radius: 12px; padding: 6px; }
.bigsvg { width: 100%; height: 220px; display: block; }
.big-line { fill: none; stroke: #43a047; stroke-width: 2.2; }
.big-limit { stroke: #e53935; stroke-width: 1.4; stroke-dasharray: 5 4; opacity: .7; }
.big-dot { fill: #81c784; }
.big-dot-last { fill: #2e7d32; }
.limit-tag { position: absolute; right: 8px; transform: translateY(-50%); font-size: 11px; color: #e53935; background: #fff; padding: 0 4px; }
.detail-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 16px 0; }
.stat { background: #f5f9f3; border-radius: 10px; padding: 8px 6px; text-align: center; }
.sk { font-size: 11px; color: #999; }
.sv { font-size: 14px; font-weight: 700; color: #333; margin-top: 2px; }
.sv.diverge { color: #e53935; }
.detail-actions { display: flex; gap: 10px; }
.harvest-act { flex: 1; padding: 12px; border: none; border-radius: 12px; background: #4caf50; color: #fff; font-size: 15px; cursor: pointer; }
.harvest-act.disabled { background: #e0e0e0; color: #999; cursor: default; }
.clear-act { padding: 12px 16px; border: 1px solid #ffcdd2; background: #fff5f5; color: #c62828; border-radius: 12px; cursor: pointer; }

/* 提示 */
.toast { position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%); padding: 12px 24px; border-radius: 999px; color: #fff; font-size: 14px; box-shadow: 0 8px 24px rgba(0,0,0,.2); z-index: 60; }
.toast.ok { background: #43a047; }
.toast.err { background: #e53935; }
.toast-enter-active, .toast-leave-active { transition: all .3s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translateX(-50%) translateY(10px); }
</style>
