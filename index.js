// index.js - 后端服务器核心代码 (环境变量访问码版本)

// 1. 导入必要的库
const express = require('express');
const cors = require('cors');
require('dotenv').config({ debug: true });

// 2. 初始化 Express 应用
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// 维度列表
const DIMENSIONS = [
    'egoism', 'greed', 'mach', 'moral', 'narcissism',
    'power', 'psychopathy', 'sadism', 'selfcentered', 'spitefulness'
];

// 模拟数据集合（用于排名计算）
const SIMULATION_COLLECTION = "simulated_tests";

// 访问码配置
let ACCESS_CODES = [];

// 初始化访问码
function initializeAccessCodes() {
    try {
        console.log('=== 初始化访问码系统 ===');
        
        // 从环境变量读取访问码
        const accessCodesEnv = process.env.ACCESS_CODES;
        
        if (!accessCodesEnv) {
            console.warn('⚠️ 未设置 ACCESS_CODES 环境变量，将使用默认测试访问码');
            // 设置一些默认测试访问码
            ACCESS_CODES = [
                {
                    code: 'TEST001',
                    maxUses: 100,
                    currentUses: 0,
                    createdAt: new Date(),
                    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30天后
                },
                {
                    code: 'RESEARCH2024',
                    maxUses: 500,
                    currentUses: 0,
                    createdAt: new Date(),
                    expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90天后
                }
            ];
        } else {
            // 解析环境变量中的访问码
            const codes = accessCodesEnv.split(',').map(code => code.trim().toUpperCase());
            
            ACCESS_CODES = codes.map(code => ({
                code: code,
                maxUses: parseInt(process.env.ACCESS_CODE_MAX_USES) || 1,
                currentUses: 0,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + (parseInt(process.env.ACCESS_CODE_EXPIRY_DAYS) || 7) * 24 * 60 * 60 * 1000)
            }));
            
            console.log(`✅ 从环境变量加载了 ${ACCESS_CODES.length} 个访问码`);
        }
        
        // 打印访问码信息（隐藏完整代码）
        ACCESS_CODES.forEach((item, index) => {
            console.log(`  访问码 ${index + 1}: ${item.code.substring(0, 3)}*** (最大使用: ${item.maxUses}, 过期: ${item.expiresAt.toDateString()})`);
        });
        
    } catch (error) {
        console.error('❌ 初始化访问码失败:', error);
        // 设置一个紧急备用访问码
        ACCESS_CODES = [{
            code: 'EMERGENCY',
            maxUses: 999,
            currentUses: 0,
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1年后
        }];
    }
}

// 初始化访问码系统
initializeAccessCodes();

// === 中间件 ===
app.use(cors({
    origin: [
        'https://snazzy-hotteok-562635.netlify.app',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
    ],
    credentials: false
})); 
app.use(express.json());

// === API 接口 ===

// 健康检查接口
app.get('/', (req, res) => {
    res.json({ 
        status: 'running', 
        message: '黑暗人格测试后端服务运行中',
        timestamp: new Date().toISOString(),
        accessCodes: {
            total: ACCESS_CODES.length,
            active: ACCESS_CODES.filter(code => code.currentUses < code.maxUses && new Date() < code.expiresAt).length
        }
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
            active: activeCodes.length,
            details: activeCodes.map(code => ({
                code: `${code.code.substring(0, 3)}***`,
                remainingUses: code.maxUses - code.currentUses,
                expiresAt: code.expiresAt.toISOString().split('T')[0]
            }))
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
            validCode.lastUsedAt = new Date();
            
            console.log(`✅ 访问码验证成功: ${cleanedAccessCode} (使用次数: ${validCode.currentUses}/${validCode.maxUses})`);
            
            res.json({
                valid: true,
                message: '访问码验证成功',
                code: cleanedAccessCode,
                expiresAt: validCode.expiresAt,
                remainingUses: validCode.maxUses - validCode.currentUses
            });
        } else {
            // 检查是否存在但已过期或达到使用上限
            const existingCode = ACCESS_CODES.find(code => code.code === cleanedAccessCode);
            
            if (existingCode) {
                if (existingCode.currentUses >= existingCode.maxUses) {
                    console.log(`❌ 访问码使用次数已达上限: ${cleanedAccessCode}`);
                    res.status(400).json({
                        valid: false,
                        message: '该访问码使用次数已达上限'
                    });
                } else if (new Date() >= existingCode.expiresAt) {
                    console.log(`❌ 访问码已过期: ${cleanedAccessCode}`);
                    res.status(400).json({
                        valid: false,
                        message: '该访问码已过期'
                    });
                } else {
                    console.log(`❌ 未知的访问码状态: ${cleanedAccessCode}`);
                    res.status(400).json({
                        valid: false,
                        message: '访问码状态异常'
                    });
                }
            } else {
                console.log(`❌ 无效的访问码: ${cleanedAccessCode}`);
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

// 管理接口：查看访问码状态
app.get('/api/admin/access-codes', (req, res) => {
    try {
        // 简单的权限验证
        const { adminKey } = req.query;
        if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
            return res.status(403).json({ 
                success: false,
                message: '无权访问管理接口' 
            });
        }

        const codesInfo = ACCESS_CODES.map(code => ({
            code: code.code,
            currentUses: code.currentUses,
            maxUses: code.maxUses,
            remainingUses: code.maxUses - code.currentUses,
            createdAt: code.createdAt,
            expiresAt: code.expiresAt,
            lastUsedAt: code.lastUsedAt || '从未使用',
            isValid: code.currentUses < code.maxUses && new Date() < code.expiresAt
        }));

        res.json({
            success: true,
            accessCodes: codesInfo,
            total: ACCESS_CODES.length,
            active: ACCESS_CODES.filter(code => code.currentUses < code.maxUses && new Date() < code.expiresAt).length
        });

    } catch (error) {
        console.error("获取访问码状态时发生错误:", error);
        res.status(500).json({ 
            success: false,
            message: '服务器内部错误'
        });
    }
});

// 管理接口：重置访问码使用次数
app.post('/api/admin/reset-access-code', (req, res) => {
    try {
        const { adminKey, code } = req.body;
        
        if (!adminKey || adminKey !== process.env.ADMIN_KEY) {
            return res.status(403).json({ 
                success: false,
                message: '无权执行此操作' 
            });
        }

        if (!code) {
            return res.status(400).json({ 
                success: false,
                message: '需要指定要重置的访问码' 
            });
        }

        const cleanedCode = code.trim().toUpperCase();
        const targetCode = ACCESS_CODES.find(ac => ac.code === cleanedCode);
        
        if (!targetCode) {
            return res.status(404).json({ 
                success: false,
                message: '未找到指定的访问码' 
            });
        }

        const oldUses = targetCode.currentUses;
        targetCode.currentUses = 0;
        
        console.log(`🔄 重置访问码 ${cleanedCode} 的使用次数: ${oldUses} -> 0`);
        
        res.json({
            success: true,
            message: `访问码 ${cleanedCode} 使用次数已重置`,
            code: cleanedCode,
            previousUses: oldUses,
            currentUses: 0
        });

    } catch (error) {
        console.error("重置访问码时发生错误:", error);
        res.status(500).json({ 
            success: false,
            message: '服务器内部错误'
        });
    }
});

// 排名计算接口（保持原有逻辑）
app.post('/api/rankings', (req, res) => {
    try {
        const userScores = req.body;

        if (!userScores || typeof userScores !== 'object') {
            return res.status(400).json({ error: '请求格式错误：需要包含分数数据的对象' });
        }

        // 验证所有维度分数
        for (const dim of DIMENSIONS) {
            const userScore = userScores[dim];
            
            if (typeof userScore !== 'number' || isNaN(userScore)) {
                return res.status(400).json({ 
                    error: `分数格式错误或缺失: ${dim}`,
                    details: `期望数字类型，收到: ${typeof userScore}`
                });
            }
        }

        // 模拟排名计算（基于正态分布）
        const rankings = {};
        for (const dim of DIMENSIONS) {
            const userScore = userScores[dim];
            
            // 模拟基于正态分布的排名计算
            // 假设平均分为20，标准差为5
            const mean = 20;
            const stdDev = 5;
            
            // 计算Z-score
            const zScore = (userScore - mean) / stdDev;
            
            // 使用标准正态分布计算百分比
            // 这是一个简化的近似计算
            const percentile = 100 * (0.5 * (1 + Math.tanh(zScore / Math.sqrt(2))));
            
            rankings[dim] = Math.min(100, Math.max(0, Math.round(percentile)));
        }

        res.json({
            message: "排名计算成功",
            rankings: rankings,
            userScores: userScores,
            totalComparisons: 1000, // 模拟数据量
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
    console.log(`🔑 访问码系统: 环境变量驱动`);
    console.log(`📍 健康检查: http://${HOST}:${PORT}/api/health`);
    console.log(`🔐 访问码验证接口: POST http://${HOST}:${PORT}/api/check-access-code`);
    console.log(`👨‍💼 管理接口: GET http://${HOST}:${PORT}/api/admin/access-codes?adminKey=YOUR_KEY`);
    console.log(`🌐 外部访问地址: https://overall-carolan-boyn-7a3aea8b.koyeb.app`);
    
    // 显示访问码摘要
    const activeCodes = ACCESS_CODES.filter(code => 
        code.currentUses < code.maxUses && new Date() < code.expiresAt
    );
    console.log(`✅ 已加载 ${ACCESS_CODES.length} 个访问码，其中 ${activeCodes.length} 个处于活跃状态`);
});
