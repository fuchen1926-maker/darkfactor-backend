// index.js - 安全增强版本（修复路由崩溃与IP识别问题）

const express = require('express');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8000; // Koyeb 默认通常推荐 8000 或 8080
const HOST = '0.0.0.0';

// === 关键修复：信任代理 ===
// 因为部署在 Koyeb/Netlify 等平台，必须设置此项才能获取用户真实 IP
// 否则所有请求的 IP 都会变成 Koyeb 内部负载均衡器的 IP
app.set('trust proxy', 1);

// 维度列表
const DIMENSIONS = [
    'egoism', 'greed', 'mach', 'moral', 'narcissism',
    'power', 'psychopathy', 'sadism', 'selfcentered', 'spitefulness'
];

// 安全存储
let ACCESS_CODES = [];
let SECURITY_RECORDS = new Map(); // IP安全记录
let ATTACK_DETECTION = {
    totalAttempts: 0,
    failedAttempts: 0,
    lastAlert: null
};

// 安全记录类
class SecurityRecord {
    constructor(ip) {
        this.ip = ip;
        this.attempts = 0;
        this.failedAttempts = 0;
        this.lastAttempt = new Date();
        this.firstSeen = new Date();
        this.isBlocked = false;
        this.blockUntil = null;
    }
    
    addAttempt(success) {
        this.attempts++;
        this.lastAttempt = new Date();
        
        if (!success) {
            this.failedAttempts++;
            
            // 如果连续失败超过阈值，暂时封禁
            if (this.failedAttempts >= 5) {
                this.isBlocked = true;
                this.blockUntil = new Date(Date.now() + 15 * 60 * 1000); // 封禁15分钟
                console.log(`🚫 IP ${this.ip} 因多次失败尝试被暂时封禁`);
            }
        } else {
            // 成功验证后重置失败计数
            this.failedAttempts = 0;
        }
    }
    
    isCurrentlyBlocked() {
        if (!this.isBlocked) return false;
        
        if (this.blockUntil && new Date() > this.blockUntil) {
            // 封禁时间已过，解除封禁
            this.isBlocked = false;
            this.blockUntil = null;
            this.failedAttempts = 0; // 重置失败计数
            console.log(`✅ IP ${this.ip} 封禁已解除`);
            return false;
        }
        
        return true;
    }
}

// 初始化访问码
function initializeAccessCodes() {
    try {
        const accessCodesEnv = process.env.ACCESS_CODES;
        
        if (!accessCodesEnv) {
            console.warn('⚠️  未设置 ACCESS_CODES 环境变量，默认无访问码');
            ACCESS_CODES = [];
        } else {
            const codes = accessCodesEnv.split(',').map(code => code.trim().toUpperCase()).filter(code => code.length > 0);
            
            ACCESS_CODES = codes.map(code => ({
                code: code,
                maxUses: parseInt(process.env.ACCESS_CODE_MAX_USES) || 9999,
                currentUses: 0,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + (parseInt(process.env.ACCESS_CODE_EXPIRY_DAYS) || 365) * 24 * 60 * 60 * 1000),
                lastUsed: null
            }));
            
            console.log(`✅ 从环境变量加载了 ${ACCESS_CODES.length} 个访问码`);
        }
        
    } catch (error) {
        console.error('初始化访问码失败:', error);
        ACCESS_CODES = [];
    }
}

// 访问码格式验证
function isValidAccessCodeFormat(code) {
    // 基本格式检查：只允许字母数字，长度1-20
    return /^[A-Z0-9]{1,20}$/.test(code);
}

// 清理过期的安全记录
function cleanupSecurityRecords() {
    const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30分钟清理一次
    const RECORD_TTL = 24 * 60 * 60 * 1000; // 记录保存24小时
    
    setInterval(() => {
        const now = new Date();
        let cleanedCount = 0;
        
        for (const [ip, record] of SECURITY_RECORDS.entries()) {
            const age = now - record.firstSeen;
            if (age > RECORD_TTL && !record.isCurrentlyBlocked()) {
                SECURITY_RECORDS.delete(ip);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`🧹 清理了 ${cleanedCount} 个过期的安全记录`);
        }
    }, CLEANUP_INTERVAL);
}

// 攻击检测和警报
function checkForAttacks() {
    const ALERT_THRESHOLD = 50; // 每小时50次失败尝试触发警报
    const ALERT_INTERVAL = 60 * 60 * 1000; // 1小时
    
    setInterval(() => {
        const recentFailures = ATTACK_DETECTION.failedAttempts;
        
        if (recentFailures >= ALERT_THRESHOLD) {
            const now = new Date();
            const timeSinceLastAlert = ATTACK_DETECTION.lastAlert ? 
                now - ATTACK_DETECTION.lastAlert : ALERT_INTERVAL + 1;
            
            // 避免频繁警报，至少间隔1小时
            if (timeSinceLastAlert > ALERT_INTERVAL) {
                console.log(`🚨 安全警报: 检测到可能的攻击！过去一小时内有 ${recentFailures} 次失败尝试`);
                ATTACK_DETECTION.lastAlert = now;
            }
        }
        
        // 重置计数器
        ATTACK_DETECTION.failedAttempts = 0;
        ATTACK_DETECTION.totalAttempts = 0;
        
    }, ALERT_INTERVAL);
}

// 初始化系统
initializeAccessCodes();
cleanupSecurityRecords();
checkForAttacks();

// === 手动 CORS 中间件 (修复路由崩溃问题) ===
// 不使用 app.options('*')，而是使用通用中间件
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Access-Code');
    
    // 直接响应预检请求
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

app.use(express.json({ limit: '10kb' })); // 限制请求体大小

// 安全检查和限流中间件
app.use((req, res, next) => {
    // 使用 req.ip，配合 app.set('trust proxy', 1) 可以获取真实IP
    const clientIP = req.ip; 
    const path = req.path;
    
    // 只对验证码接口进行安全检查
    if (path === '/api/check-access-code') {
        // 获取或创建安全记录
        if (!SECURITY_RECORDS.has(clientIP)) {
            SECURITY_RECORDS.set(clientIP, new SecurityRecord(clientIP));
        }
        
        const securityRecord = SECURITY_RECORDS.get(clientIP);
        
        // 检查是否被封禁
        if (securityRecord.isCurrentlyBlocked()) {
            console.log(`🚫 拒绝被封禁IP的请求: ${clientIP}`);
            return res.status(429).json({
                valid: false,
                message: '尝试次数过多，请15分钟后再试'
            });
        }
        
        // 检查请求频率（简单限流：每秒1次）
        const timeSinceLastAttempt = new Date() - securityRecord.lastAttempt;
        if (timeSinceLastAttempt < 1000) { 
            console.log(`⚠️ IP ${clientIP} 请求过于频繁`);
            return res.status(429).json({
                valid: false,
                message: '请求过于频繁，请稍后再试'
            });
        }
        
        // 将安全记录附加到请求对象
        req.securityRecord = securityRecord;
    }
    
    next();
});

// === API 接口 ===

app.get('/', (req, res) => {
    const activeIPs = Array.from(SECURITY_RECORDS.values()).filter(record => 
        !record.isCurrentlyBlocked()
    ).length;
    
    res.json({ 
        status: 'running', 
        message: '黑暗人格测试后端服务运行中',
        security: {
            activeIPs: activeIPs,
            blockedIPs: Array.from(SECURITY_RECORDS.values()).filter(record => 
                record.isCurrentlyBlocked()
            ).length,
            totalAttempts: ATTACK_DETECTION.totalAttempts,
            failedAttempts: ATTACK_DETECTION.failedAttempts
        },
        timestamp: new Date().toISOString()
    });
});

app.get('/api/health', (req, res) => {
    const activeCodes = ACCESS_CODES.filter(code => 
        code.currentUses < code.maxUses && new Date() < code.expiresAt
    );
    
    res.json({
        status: 'healthy',
        accessCodes: {
            total: ACCESS_CODES.length,
            active: activeCodes.length
        },
        security: {
            monitoredIPs: SECURITY_RECORDS.size,
            blockedIPs: Array.from(SECURITY_RECORDS.values()).filter(record => 
                record.isCurrentlyBlocked()
            ).length
        },
        serverTime: new Date().toISOString()
    });
});

// 安全增强的访问码验证接口
app.post('/api/check-access-code', (req, res) => {
    try {
        const { accessCode } = req.body;
        const securityRecord = req.securityRecord;
        const clientIP = req.ip; // 使用 req.ip (已配置 trust proxy)

        // 全局统计
        ATTACK_DETECTION.totalAttempts++;

        // 验证输入存在性和类型
        if (!accessCode || typeof accessCode !== 'string') {
            if (securityRecord) securityRecord.addAttempt(false);
            ATTACK_DETECTION.failedAttempts++;
            return res.status(400).json({ 
                valid: false, 
                message: '请输入访问码' 
            });
        }

        // 清理和验证访问码格式
        const cleanedAccessCode = accessCode.trim().toUpperCase();
        
        if (cleanedAccessCode.length === 0) {
            if (securityRecord) securityRecord.addAttempt(false);
            ATTACK_DETECTION.failedAttempts++;
            return res.status(400).json({ 
                valid: false, 
                message: '访问码不能为空' 
            });
        }

        // 格式验证
        if (!isValidAccessCodeFormat(cleanedAccessCode)) {
            if (securityRecord) securityRecord.addAttempt(false);
            ATTACK_DETECTION.failedAttempts++;
            console.log(`⚠️ IP ${clientIP} 尝试使用无效格式的访问码: ${cleanedAccessCode}`);
            return res.status(400).json({
                valid: false,
                message: '访问码格式不正确'
            });
        }

        // 查找有效的访问码
        const validCode = ACCESS_CODES.find(code => 
            code.code === cleanedAccessCode && 
            code.currentUses < code.maxUses && 
            new Date() < code.expiresAt
        );

        if (validCode) {
            // 更新使用次数
            validCode.currentUses += 1;
            validCode.lastUsed = new Date();
            
            // 记录成功尝试
            if (securityRecord) securityRecord.addAttempt(true);
            
            console.log(`✅ 访问码验证成功: ${cleanedAccessCode} (IP: ${clientIP})`);
            
            res.json({
                valid: true,
                message: '访问码验证成功',
                code: cleanedAccessCode,
                expiresAt: validCode.expiresAt,
                remainingUses: validCode.maxUses - validCode.currentUses
            });
        } else {
            // 记录失败尝试
            if (securityRecord) securityRecord.addAttempt(false);
            ATTACK_DETECTION.failedAttempts++;
            
            // 检查访问码状态（用于给用户更具体的提示，或者可以为了安全统一返回无效）
            const existingCode = ACCESS_CODES.find(code => code.code === cleanedAccessCode);
            
            let message = '无效的访问码';
            
            if (existingCode) {
                if (existingCode.currentUses >= existingCode.maxUses) {
                    message = '该访问码使用次数已达上限';
                } else if (new Date() >= existingCode.expiresAt) {
                    message = '该访问码已过期';
                }
            }
            
            console.log(`❌ 访问码验证失败: ${cleanedAccessCode} (IP: ${clientIP}) - ${message}`);
            
            res.status(400).json({
                valid: false,
                message: message
            });
        }

    } catch (error) {
        console.error("验证访问码时发生错误:", error);
        
        // 记录安全记录（如果存在）
        if (req.securityRecord) {
            req.securityRecord.addAttempt(false);
        }
        ATTACK_DETECTION.failedAttempts++;
        
        res.status(500).json({ 
            valid: false,
            message: '服务器错误，请稍后重试'
        });
    }
});

// 安全状态查看接口（需要管理员权限）
app.get('/api/admin/security-status', (req, res) => {
    try {
        const { adminKey } = req.query;
        
        // 简单的管理员验证
        if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
            return res.status(403).json({ 
                success: false,
                message: '无权访问安全信息' 
            });
        }

        const blockedIPs = Array.from(SECURITY_RECORDS.entries())
            .filter(([ip, record]) => record.isCurrentlyBlocked())
            .map(([ip, record]) => ({
                ip: ip,
                blockedUntil: record.blockUntil,
                failedAttempts: record.failedAttempts,
                firstSeen: record.firstSeen
            }));

        const recentActivity = Array.from(SECURITY_RECORDS.entries())
            .filter(([ip, record]) => new Date() - record.lastAttempt < 60 * 60 * 1000) // 最近1小时
            .map(([ip, record]) => ({
                ip: ip,
                attempts: record.attempts,
                failedAttempts: record.failedAttempts,
                lastAttempt: record.lastAttempt,
                isBlocked: record.isCurrentlyBlocked()
            }))
            .sort((a, b) => new Date(b.lastAttempt) - new Date(a.lastAttempt))
            .slice(0, 20); // 最近20个

        res.json({
            success: true,
            security: {
                totalRecords: SECURITY_RECORDS.size,
                blockedIPs: blockedIPs.length,
                totalAttempts: ATTACK_DETECTION.totalAttempts,
                failedAttempts: ATTACK_DETECTION.failedAttempts,
                lastAlert: ATTACK_DETECTION.lastAlert
            },
            blockedIPs: blockedIPs,
            recentActivity: recentActivity
        });

    } catch (error) {
        console.error("获取安全状态时发生错误:", error);
        res.status(500).json({ 
            success: false,
            message: '服务器内部错误'
        });
    }
});

// 解除IP封禁接口（管理员用）
app.post('/api/admin/unblock-ip', (req, res) => {
    try {
        const { adminKey, ip } = req.body;
        
        if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
            return res.status(403).json({ 
                success: false,
                message: '无权执行此操作' 
            });
        }

        if (!ip) {
            return res.status(400).json({ 
                success: false,
                message: '需要指定要解除封禁的IP地址' 
            });
        }

        if (SECURITY_RECORDS.has(ip)) {
            const record = SECURITY_RECORDS.get(ip);
            record.isBlocked = false;
            record.blockUntil = null;
            record.failedAttempts = 0;
            
            console.log(`✅ 管理员解除了IP封禁: ${ip}`);
            
            res.json({
                success: true,
                message: `IP ${ip} 已解除封禁`
            });
        } else {
            res.status(404).json({ 
                success: false,
                message: '未找到该IP的安全记录' 
            });
        }

    } catch (error) {
        console.error("解除IP封禁时发生错误:", error);
        res.status(500).json({ 
            success: false,
            message: '服务器内部错误'
        });
    }
});

// 排名计算接口
app.post('/api/rankings', (req, res) => {
    try {
        const userScores = req.body;

        if (!userScores || typeof userScores !== 'object') {
            return res.status(400).json({ error: '请求格式错误：需要包含分数数据的对象' });
        }

        // 简单的输入验证
        const processedScores = {};
        for (const dim of DIMENSIONS) {
            const score = userScores[dim];
            processedScores[dim] = (typeof score === 'number') ? score : 0;
        }

        const rankings = {};
        for (const dim of DIMENSIONS) {
            const userScore = processedScores[dim];
            
            // 假设的常模数据 (平均分20，标准差5)
            const mean = 20;
            const stdDev = 5;
            const zScore = (userScore - mean) / stdDev;
            const percentile = 100 * (0.5 * (1 + Math.tanh(zScore / Math.sqrt(2))));
            
            rankings[dim] = Math.min(100, Math.max(0, Math.round(percentile)));
        }

        res.json({
            message: "排名计算成功",
            rankings: rankings,
            userScores: processedScores,
            totalComparisons: 1000,
            calculatedAt: new Date().toISOString()
        });

    } catch (error) {
        console.error("计算排名时发生错误:", error);
        res.status(500).json({ 
            error: '服务器内部错误，无法计算排名。'
        });
    }
});

// 启动服务器
app.listen(PORT, HOST, () => {
    console.log(`🚀 服务器正在 ${HOST}:${PORT} 上运行`);
    console.log(`🔒 安全防护: 已启用IP监控 (Proxy Trust: On)`);
    console.log(`📍 健康检查: http://${HOST}:${PORT}/api/health`);
});

// 优雅关闭处理
process.on('SIGTERM', () => {
    console.log('收到 SIGTERM 信号，开始优雅关闭...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('收到 SIGINT 信号，开始优雅关闭...');
    process.exit(0);
});
