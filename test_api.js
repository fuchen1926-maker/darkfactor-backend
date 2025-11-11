// test_api.js - 模拟前端请求的脚本

// 假设服务器运行在本地的 3000 端口
const API_URL = 'http://localhost:3000/api/rankings';

// 模拟用户的10个原始分数 (7-35 分)
// 注意：这是随机选取的测试分数，用于验证排名计算
const testUserScores = {
    egoism: 30,         // 高分段 (期望排名高)
    greed: 15,          // 低分段 (期望排名低)
    mach: 22,           // 中分段
    moral: 28,
    narcissism: 12,
    power: 33,          // 接近满分
    psychopathy: 18,
    sadism: 25,
    selfcentered: 20,
    spitefulness: 17
};

async function testRankingsAPI() {
    try {
        console.log("--- 正在模拟前端请求排名 ---");
        console.log("发送数据:", testUserScores);
        
        // 1. 发送 POST 请求到你的后端 API
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            // 将分数对象转换成 JSON 字符串发送
            body: JSON.stringify(testUserScores)
        });

        // 2. 检查响应是否成功
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`API 返回错误: ${response.status} - ${errorData.error}`);
        }

        // 3. 解析并显示后端返回的排名结果
        const result = await response.json();

        console.log("\n--- 后端返回结果 ---");
        console.log("信息:", result.message);
        console.log("用户原始分数 (用于对比):", result.userScores);
        console.log("计算出的排名百分比:", result.rankings);

    } catch (error) {
        console.error("❌ API 测试失败:", error.message);
    }
}

// Node.js 中没有内置的 fetch()，我们需要先导入一个版本
// 注意：如果你的 Node.js 版本够新，fetch() 已经是内置的了，不需要导入
// 为了兼容，我们先假设它已内置，如果报错再处理。
testRankingsAPI();