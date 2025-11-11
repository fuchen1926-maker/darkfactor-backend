// seed.js - 数据库播种脚本
require('dotenv').config({ debug: true }); // 启用调试模式

const { MongoClient } = require('mongodb');

// 数据库连接信息 - 从环境变量中读取
let URI = process.env.MONGO_URI;
const DB_NAME = "darkfactorDB"; 
const COLLECTION_NAME = "simulated_tests"; // 存储虚拟数据的集合名

// 详细的调试信息
console.log('=== MongoDB 连接调试信息 ===');
console.log('原始 MONGO_URI:', URI);
console.log('MONGO_URI 长度:', URI ? URI.length : '未定义');
console.log('MONGO_URI 开头字符:', URI ? URI.substring(0, 20) : '未定义');
console.log('MONGO_URI 结尾字符:', URI ? URI.substring(URI.length - 10) : '未定义');

// 检查是否有隐藏字符
if (URI) {
    console.log('字符代码检查:');
    for (let i = 0; i < Math.min(20, URI.length); i++) {
        console.log(`  位置 ${i}: '${URI[i]}' (代码: ${URI.charCodeAt(i)})`);
    }
}

// 清理 URI - 去除可能存在的引号和空白字符
if (URI) {
    const originalURI = URI;
    URI = URI.trim().replace(/^["']|["']$/g, ''); // 去除开头和结尾的引号和空白
    
    if (originalURI !== URI) {
        console.log('清理后的 MONGO_URI:', URI);
    }
}

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
    if (URI.includes('mongodb+srv') && !URI.startsWith('mongodb+srv://')) {
        console.error("修复建议：连接字符串可能缺少协议前缀，尝试添加 'mongodb+srv://'");
    }
    
    process.exit(1);
}

console.log('✅ MONGO_URI 格式验证通过');

const client = new MongoClient(URI, {
    serverSelectionTimeoutMS: 10000, // 10秒超时
    connectTimeoutMS: 10000,
});

// 生成一个介于 min 和 max 之间的随机整数 (用于生成 7-35 分)
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 维度列表 (用于生成数据结构)
const dimensions = [
    'egoism', 'greed', 'mach', 'moral', 'narcissism',
    'power', 'psychopathy', 'sadism', 'selfcentered', 'spitefulness'
];

// 生成一条完整的虚拟测试数据
function generateSingleTestData() {
    const data = {};
    dimensions.forEach(dim => {
        // 每个维度的分数范围是 7 到 35
        data[dim] = getRandomInt(7, 35);
    });
    
    // 添加时间戳
    data.createdAt = new Date();
    
    return data;
}

// 主函数：连接数据库，生成并插入数据
async function seedDatabase(count) {
    try {
        console.log(`\n=== 开始数据库播种 ===`);
        console.log(`正在连接到 MongoDB...`);
        console.log(`数据库: ${DB_NAME}`);
        console.log(`集合: ${COLLECTION_NAME}`);
        
        await client.connect();
        console.log("✅ 成功连接到 MongoDB!");
        
        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        // 1. 清空旧数据（确保每次都是新鲜的1000份数据）
        console.log(`正在清空集合 ${COLLECTION_NAME} 中的旧数据...`);
        const deleteResult = await collection.deleteMany({});
        console.log(`已清空集合 ${COLLECTION_NAME} 中的 ${deleteResult.deletedCount} 条旧数据。`);

        // 2. 生成数据
        console.log(`正在生成 ${count} 份虚拟测试数据...`);
        const simulatedData = [];
        for (let i = 0; i < count; i++) {
            simulatedData.push(generateSingleTestData());
            
            // 每100条显示进度
            if ((i + 1) % 100 === 0) {
                console.log(`已生成 ${i + 1} 条数据...`);
            }
        }
        console.log(`成功生成 ${count} 份虚拟测试数据。`);

        // 3. 批量插入数据到数据库
        console.log(`正在插入数据到数据库...`);
        const result = await collection.insertMany(simulatedData);
        console.log(`✅ 成功将 ${result.insertedCount} 份数据插入到数据库 ${DB_NAME}.${COLLECTION_NAME}`);
        
        console.log(`\n=== 数据库播种完成 ===`);
        
    } catch (error) {
        console.error("\n❌ 数据播种失败:", error.message);
        console.error("\n请检查以下可能的问题：");
        console.error("1. .env 文件中的 MONGO_URI 是否正确");
        console.error("2. MongoDB Atlas 网络访问是否设置（IP白名单）");
        console.error("3. 数据库用户名和密码是否正确");
        console.error("4. 网络连接是否正常");
        console.error("5. 集群名称是否正确（cluster0.gepx5a1.mongodb.net）");
        
        if (error.message.includes('authentication')) {
            console.error("\n🔐 认证失败：请检查用户名和密码是否正确");
        }
        if (error.message.includes('getaddrinfo')) {
            console.error("\n🌐 网络连接失败：请检查网络连接和集群地址是否正确");
        }
    } finally {
        // 无论成功还是失败，最后都要断开数据库连接
        await client.close();
        console.log("数据库连接已关闭。");
    }
}

// 运行主函数，生成 1000 份数据
const NUM_TESTS = 1000;
console.log(`开始执行数据库播种脚本，将生成 ${NUM_TESTS} 条测试数据...`);
seedDatabase(NUM_TESTS);