// index.js - 简化版本，只修复CORS错误

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// 维度列表
const DIMENSIONS = [
    'egoism', 'greed', 'mach', 'moral', 'narcissism',
    'power', 'psychopathy', 'sadism', 'selfcentered', 'spitefulness'
];

// 访问码存储
let ACCESS_CODES = [];

// 初始化访问码
function initializeAccessCodes() {
    try {
        console.log('=== 初始化访问码系统 ===');
        
        const accessCodesEnv = process.env.ACCESS_CODES;
        
        if (!accessCodesEnv) {
            console.warn('⚠️ 未设置 ACCESS_CODES 环境变量');
            ACCESS_CODES = [];
        } else {
            const codes = accessCodesEnv.split(',').map(code => code.trim().toUpperCase());
            
            ACCESS_CODES = codes.map(code => ({
                code: code,
                maxUses: parseInt(process.env.ACCESS_CODE_MAX_USES) || 100,
                currentUses: 0,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + (parseInt(process.env.ACCESS_CODE_EXPIRY_DAYS) || 30) * 24 * 60 * 60 * 1000)
            }));
            
            console.log(`✅ 从环境变量加载了 ${ACCESS_CODES.length} 个访问码`);
        }
        
    } catch (error) {
        console.error('❌ 初始化访问码失败:', error);
        ACCESS_CODES = [];
    }
}

// 初始化系统
initializeAccessCodes();

// === 修复CORS配置 ===
// 关键修复：使用更宽松的CORS配置
app.use(cors({
    origin: true, // 允许所有来源，或者可以指定特定来源
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// 显式处理 OPTIONS 预检请求 - 这是关键修复
app.options('*', cors());

app.use(express.json());

// === API 接口 ===

// 健康检查接口
app.get('/', (req, res) => {
    res.json({ 
        status: 'running', 
        message: '黑暗人格测试后端服务运行中',
        timestamp: new Date().toISOString()
    });
});

// 系统状态检查
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
        dimensions: DIMENSIONS,
        serverTime: new Date().toISOString()
    });
});

// 访问码验证接口
app.post('/api/check-access-code', (req, res) => {
    try {
        const { accessCode } = req.body;

        // 验证输入
        if (!accessCode || typeof accessCode !== 'string') {
            return res.status(400).json({ 
                valid: false, 
                message: '访问码不能为空且必须为字符串格式' 
            });
        }

        // 清理访问码
        const cleanedAccessCode = accessCode.trim().toUpperCase();
        
        if (cleanedAccessCode.length === 0) {
            return res.status(400).json({ 
                valid: false, 
                message: '访问码不能为空' 
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
            
            console.log(`✅ 访问码验证成功: ${cleanedAccessCode}`);
            
            res.json({
                valid: true,
                message: '访问码验证成功',
                code: cleanedAccessCode,
                expiresAt: validCode.expiresAt,
                remainingUses: validCode.maxUses - validCode.currentUses
            });
        } else {
            // 检查访问码状态
            const existingCode = ACCESS_CODES.find(code => code.code === cleanedAccessCode);
            
            if (existingCode) {
                if (existingCode.currentUses >= existingCode.maxUses) {
                    res.status(400).json({
                        valid: false,
                        message: '该访问码使用次数已达上限'
                    });
                } else if (new Date() >= existingCode.expiresAt) {
                    res.status(400).json({
                        valid: false,
                        message: '该访问码已过期'
                    });
                } else {
                    res.status(400).json({
                        valid: false,
                        message: '访问码状态异常'
                    });
                }
            } else {
                res.status(400).json({
                    valid: false,
                    message: '无效的访问码'
                });
            }
        }

    } catch (error) {
        console.error("验证访问码时发生错误:", error);
        res.status(500).json({ 
            valid: false,
            message: '服务器内部错误，无法验证访问码。'
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

        for (const dim of DIMENSIONS) {
            const userScore = userScores[dim];
            
            if (typeof userScore !== 'number' || isNaN(userScore)) {
                return res.status(400).json({ 
                    error: `分数格式错误或缺失: ${dim}`,
                    details: `期望数字类型，收到: ${typeof userScore}`
                });
            }
        }

        const rankings = {};
        for (const dim of DIMENSIONS) {
            const userScore = userScores[dim];
            
            // 模拟排名计算
            const mean = 20;
            const stdDev = 5;
            const zScore = (userScore - mean) / stdDev;
            const percentile = 100 * (0.5 * (1 + Math.tanh(zScore / Math.sqrt(2))));
            
            rankings[dim] = Math.min(100, Math.max(0, Math.round(percentile)));
        }

        res.json({
            message: "排名计算成功",
            rankings: rankings,
            userScores: userScores,
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

// === 服务器启动 ===

app.listen(PORT, HOST, () => {
    console.log(`🚀 服务器正在 ${HOST}:${PORT} 上运行`);
    console.log(`📊 维度数量: ${DIMENSIONS.length}`);
    console.log(`🔑 访问码数量: ${ACCESS_CODES.length}`);
    console.log(`📍 健康检查: http://${HOST}:${PORT}/api/health`);
    console.log(`🔐 访问码验证接口: POST http://${HOST}:${PORT}/api/check-access-code`);
    console.log(`🌐 CORS配置: 已启用，允许所有来源`);
});
