// index.js - 后端服务器核心代码 (增强调试版)

// 1. 导入必要的库
const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb'); 
require('dotenv').config({ debug: true }); // 启用详细调试

// 2. 初始化 Express 应用
const app = express();
const PORT = process.env.PORT || 3000;

// === 数据库配置 ===
let URI = process.env.MONGO_URI;
const DB_NAME = "darkfactorDB"; 
const SIMULATION_COLLECTION = "simulated_tests";

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
app.use(cors()); 
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
        
        res.json({
            status: 'healthy',
            database: 'connected',
            collectionCount: count,
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
        
        // 测试连接
        const collection = db.collection(SIMULATION_COLLECTION);
        const count = await collection.countDocuments();
        console.log(`📊 当前集合文档数量: ${count}`);
        
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
        
        app.listen(PORT, () => {
            console.log(`🚀 服务器正在端口 ${PORT} 上运行`);
            console.log(`📊 数据库: ${DB_NAME}`);
            console.log(`📁 集合: ${SIMULATION_COLLECTION}`);
            console.log(`🔢 维度数量: ${DIMENSIONS.length}`);
            console.log(`📍 健康检查: http://localhost:${PORT}/api/health`);
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