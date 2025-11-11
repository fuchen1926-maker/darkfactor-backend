// index.js - 后端服务器核心代码 (增强调试版)

// 1. 导入必要的库
const express = require('express');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb'); 
require('dotenv').config({ debug: true }); // 启用详细调试

// 2. 初始化 Express 应用
const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // 新增：支持环境变量配置主机

// === 数据库配置 ===
let URI = process.env.MONGO_URI;
const DB_NAME = "darkfactorDB"; 
const SIMULATION_COLLECTION = "simulated_tests";
const ACCESS_CODES_COLLECTION = "access_codes"; // 新增：访问码集合

// 维度列表
const DIMENSIONS = [
    'egoism', 'greed', 'mach', 'moral', 'narcissism',
    'power', 'psychopathy', 'sadism', 'selfcentered', 'spitefulness'
];

// 详细的 URI 调试和清理
console.log('=== MongoDB URI 调试信息 ===');
console.log('原始 MONGO_URI:', URI);
console.log('MONGO_URI 类型:', typeof URI);
console.log('MONGO_URI 长度:', URI ? URI.length : '未定义');

// 清理 URI 函数
function cleanMongoURI(uri) {
    if (!uri) return null;
    
    console.log('清理前的 URI:', uri);
    
    // 去除前后空白和引号
    let cleaned = uri.trim()
                     .replace(/^["']|["']$/g, '') // 去除引号
                     .replace(/[\u200B-\u200D\uFEFF]/g, ''); // 去除零宽字符
    
    // 检查并修复协议
    if (!cleaned.startsWith('mongodb://') && !cleaned.startsWith('mongodb+srv://')) {
        if (cleaned.includes('mongodb+srv:')) {
            // 尝试修复缺少 // 的情况
            cleaned = cleaned.replace('mongodb+srv:', 'mongodb+srv://');
            console.log('修复后的 URI:', cleaned);
        } else if (cleaned.includes('@')) {
            // 看起来像连接字符串但缺少协议
            cleaned = 'mongodb+srv://' + cleaned;
            console.log('添加协议后的 URI:', cleaned);
        }
    }
    
    console.log('清理后的 URI:', cleaned);
    return cleaned;
}

// 清理 URI
URI = cleanMongoURI(URI);

// 安全检查
if (!URI) {
    console.error("致命错误：未设置 MONGO_URI 环境变量。");
    console.error("请检查 .env 文件是否存在，并且包含 MONGO_URI 变量。");
    process.exit(1);
}

// 验证连接字符串格式
if (!URI.startsWith('mongodb://') && !URI.startsWith('mongodb+srv://')) {
    console.error("错误：MONGO_URI 格式不正确。");
    console.error("连接字符串必须以 'mongodb://' 或 'mongodb+srv://' 开头");
    console.error("当前连接字符串开头:", URI.substring(0, 20));
    console.error("完整连接字符串:", URI);
    
    // 提供修复建议
    const suggestedURI = 'mongodb+srv://darkfactor_user:fuchen1926@cluster0.gepx5a1.mongodb.net/?appName=Cluster0';
    console.error("建议的格式:", suggestedURI);
    
    process.exit(1);
}

console.log('✅ MONGO_URI 格式验证通过');

// 数据库连接实例
let db = null;
let client = null;

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

// 自定义中间件：确保数据库连接
app.use(async (req, res, next) => {
    try {
        if (!db) {
            await connectDB();
        }
        next();
    } catch (error) {
        console.error("数据库连接中间件错误:", error);
        res.status(503).json({ error: '数据库服务暂时不可用，请稍后重试。' });
    }
});

// === API 接口 ===

// 健康检查接口
app.get('/', (req, res) => {
    res.json({ 
        status: 'running', 
        message: 'Backend is running and connected to DB!',
        timestamp: new Date().toISOString()
    });
});

// 数据库状态检查
app.get('/api/health', async (req, res) => {
    try {
        const collection = db.collection(SIMULATION_COLLECTION);
        const count = await collection.countDocuments();
        
        // 检查访问码集合
        const accessCodesCollection = db.collection(ACCESS_CODES_COLLECTION);
        const accessCodesCount = await accessCodesCollection.countDocuments();
        const validAccessCodesCount = await accessCodesCollection.countDocuments({ 
            used: false,
            $or: [
                { expiresAt: { $gt: new Date() } },
                { expiresAt: { $exists: false } }
            ]
        });
        
        res.json({
            status: 'healthy',
            database: 'connected',
            collectionCount: count,
            accessCodes: {
                total: accessCodesCount,
                valid: validAccessCodesCount
            },
            dimensions: DIMENSIONS
        });
    } catch (error) {
        console.error("健康检查失败:", error);
        res.status(503).json({ 
            status: 'unhealthy',
            error: '数据库连接异常'
        });
    }
});

// 新增：访问码验证接口
app.post('/api/check-access-code', async (req, res) => {
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

        const collection = db.collection(ACCESS_CODES_COLLECTION);
        
        // 查找有效的访问码
        const validCode = await collection.findOne({
            code: cleanedAccessCode,
            used: false,
            $or: [
                { expiresAt: { $gt: new Date() } },
                { expiresAt: { $exists: false } }
            ]
        });

        if (validCode) {
            // 更新使用次数和最后使用时间
            const now = new Date();
            await collection.updateOne(
                { _id: validCode._id },
                { 
                    $set: { 
                        updatedAt: now,
                        lastUsedAt: now
                    },
                    $inc: { currentUses: 1 }
                }
            );
            
            console.log(`✅ 访问码验证成功: ${cleanedAccessCode}`);
            
            res.json({
                valid: true,
                message: '访问码验证成功',
                code: cleanedAccessCode,
                expiresAt: validCode.expiresAt,
                remainingUses: validCode.maxUses - (validCode.currentUses + 1)
            });
        } else {
            // 检查是否存在但已使用
            const usedCode = await collection.findOne({
                code: cleanedAccessCode
            });
            
            if (usedCode && usedCode.used) {
                console.log(`❌ 访问码已被使用: ${cleanedAccessCode}`);
                res.status(400).json({
                    valid: false,
                    message: '该访问码已被使用'
                });
            } else if (usedCode && usedCode.expiresAt && usedCode.expiresAt <= new Date()) {
                console.log(`❌ 访问码已过期: ${cleanedAccessCode}`);
                res.status(400).json({
                    valid: false,
                    message: '该访问码已过期'
                });
            } else if (usedCode && usedCode.currentUses >= usedCode.maxUses) {
                console.log(`❌ 访问码使用次数已达上限: ${cleanedAccessCode}`);
                res.status(400).json({
                    valid: false,
                    message: '该访问码使用次数已达上限'
                });
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
        
        if (error.name === 'MongoNetworkError') {
            res.status(503).json({ 
                valid: false,
                message: '数据库连接失败，请稍后重试。',
                code: 'DB_CONNECTION_ERROR'
            });
        } else {
            res.status(500).json({ 
                valid: false,
                message: '服务器内部错误，无法验证访问码。',
                code: 'INTERNAL_SERVER_ERROR'
            });
        }
    }
});

// 新增：创建访问码接口（管理用）
app.post('/api/create-access-code', async (req, res) => {
    try {
        const { code, expiresInHours = 24 } = req.body; // 默认24小时过期

        // 验证管理员权限（这里可以添加更复杂的权限验证）
        const { adminToken } = req.headers;
        if (!adminToken || adminToken !== process.env.ADMIN_TOKEN) {
            return res.status(403).json({ 
                success: false,
                message: '无权执行此操作' 
            });
        }

        if (!code || typeof code !== 'string') {
            return res.status(400).json({ 
                success: false,
                message: '访问码不能为空且必须为字符串格式' 
            });
        }

        const cleanedCode = code.trim().toUpperCase();
        const collection = db.collection(ACCESS_CODES_COLLECTION);

        // 检查是否已存在
        const existingCode = await collection.findOne({ code: cleanedCode });
        if (existingCode) {
            return res.status(400).json({ 
                success: false,
                message: '该访问码已存在' 
            });
        }

        // 自动计算时间
        const now = new Date();
        const expiresAt = new Date(now.getTime() + (expiresInHours * 60 * 60 * 1000)); // 默认24小时后

        // 创建访问码文档（自动设置时间）
        const accessCodeDoc = {
            code: cleanedCode,
            used: false,
            maxUses: 1,
            currentUses: 0,
            createdAt: now,           // 自动设置为当前时间
            updatedAt: now,           // 自动设置为当前时间
            expiresAt: expiresAt,     // 自动设置为24小时后
            createdBy: 'admin'
        };

        const result = await collection.insertOne(accessCodeDoc);
        
        console.log(`✅ 创建访问码成功: ${cleanedCode}, 过期时间: ${expiresAt}`);
        
        res.json({
            success: true,
            message: '访问码创建成功',
            code: cleanedCode,
            id: result.insertedId,
            createdAt: now,
            expiresAt: expiresAt
        });

    } catch (error) {
        console.error("创建访问码时发生错误:", error);
        res.status(500).json({ 
            success: false,
            message: '服务器内部错误，无法创建访问码。'
        });
    }
});

// 排名计算接口
app.post('/api/rankings', async (req, res) => {
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

        const collection = db.collection(SIMULATION_COLLECTION);
        const rankings = {};

        for (const dim of DIMENSIONS) {
            const userScore = userScores[dim];
            const lowerCount = await collection.countDocuments({
                [dim]: { $lt: userScore }
            });

            const rankPercentage = Math.floor((lowerCount / 1000) * 100);
            rankings[dim] = Math.min(100, Math.max(0, rankPercentage));
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
        
        if (error.name === 'MongoNetworkError') {
            res.status(503).json({ 
                error: '数据库连接失败，请稍后重试。',
                code: 'DB_CONNECTION_ERROR'
            });
        } else {
            res.status(500).json({ 
                error: '服务器内部错误，无法计算排名。',
                code: 'INTERNAL_SERVER_ERROR'
            });
        }
    }
});

// === 数据库连接函数 ===

async function connectDB() {
    try {
        if (client) {
            await client.close();
        }

        console.log('正在使用以下 URI 连接 MongoDB:');
        console.log(URI.substring(0, 40) + '...'); // 只显示部分，避免暴露密码

        client = new MongoClient(URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });

        await client.connect();
        db = client.db(DB_NAME);
        
        console.log("✅ MongoDB 连接成功！数据库已准备就绪。");
        
        // 测试连接和集合
        const collection = db.collection(SIMULATION_COLLECTION);
        const count = await collection.countDocuments();
        console.log(`📊 当前集合文档数量: ${count}`);
        
        // 检查访问码集合是否存在，如果不存在则创建索引
        const accessCodesCollection = db.collection(ACCESS_CODES_COLLECTION);
        await accessCodesCollection.createIndex({ code: 1 }, { unique: true });
        await accessCodesCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        const accessCodesCount = await accessCodesCollection.countDocuments();
        console.log(`🔑 访问码数量: ${accessCodesCount}`);
        
        return db;

    } catch (error) {
        console.error("❌ MongoDB 连接失败:", error.message);
        
        if (error.message.includes('authentication')) {
            console.error("🔐 认证失败：请检查 MONGO_URI 中的用户名和密码");
        } else if (error.message.includes('getaddrinfo')) {
            console.error("🌐 网络连接失败：请检查网络和 MongoDB Atlas 白名单设置");
        } else if (error.message.includes('mongodb')) {
            console.error("🔗 连接字符串格式错误：请检查 MONGO_URI 格式");
        }
        
        throw error;
    }
}

// === 优雅关闭处理 ===

process.on('SIGINT', async () => {
    console.log('\n正在关闭服务器...');
    if (client) {
        await client.close();
        console.log('MongoDB 连接已关闭');
    }
    process.exit(0);
});

// === 服务器启动 ===

async function startServer() {
    try {
        await connectDB();
        
        // 修改这里：从 localhost 改为 0.0.0.0
        app.listen(PORT, HOST, () => {
            console.log(`🚀 服务器正在 ${HOST}:${PORT} 上运行`);
            console.log(`📊 数据库: ${DB_NAME}`);
            console.log(`📁 集合: ${SIMULATION_COLLECTION}`);
            console.log(`🔑 访问码集合: ${ACCESS_CODES_COLLECTION}`);
            console.log(`🔢 维度数量: ${DIMENSIONS.length}`);
            console.log(`📍 健康检查: http://${HOST}:${PORT}/api/health`);
            console.log(`🔐 访问码验证接口: POST http://${HOST}:${PORT}/api/check-access-code`);
            console.log(`🌐 外部访问地址: https://overall-carolan-boyn-7a3aea8b.koyeb.app`);
        });

    } catch (error) {
        console.error("❌ 服务器启动失败:", error.message);
        console.log("💡 请检查：");
        console.log("   1. .env 文件中的 MONGO_URI 是否正确");
        console.log("   2. MongoDB Atlas 网络访问设置");
        console.log("   3. 数据库用户名和密码");
        process.exit(1);
    }
}

// 启动服务器
startServer();
