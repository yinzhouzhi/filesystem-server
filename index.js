/**
 * 文件系统服务器入口文件
 * 导出MCP服务器启动函数并处理直接运行
 */

// 导入核心模块
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const path = require('path');
const fs = require('fs');

// 获取MCP服务器
const mcpServer = require('./src/mcp-server');

// 日志工具
const logger = require('./src/utils/logging');

// 确保日志目录存在
const logDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 导出所有工具函数和主服务器启动功能
module.exports = {
  // 主服务器启动函数
  startServer: mcpServer.startServer,
  
  // 工具模块导出
  fileTools: require('./src/tools/file-tools'),
  dirTools: require('./src/tools/dir-tools'),
  lineTools: require('./src/tools/line-tools'),
  watchTools: require('./src/tools/watch-tools'),
  officeTools: require('./src/tools/office-tools'),
  
  // 工具注册表
  tools: require('./src/tools/index'),
  
  // 日志工具
  logger
}; 

// 如果是直接运行这个文件，则启动服务器
if (require.main === module) {
  console.log('正在启动文件系统MCP服务器...');
  mcpServer.startServer()
    .then(() => {
      console.log('服务器启动成功，等待连接...');
    })
    .catch(err => {
      console.error('服务器启动失败:', err);
      process.exit(1);
    });
} 