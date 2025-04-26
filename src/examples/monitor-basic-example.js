/**
 * 基础文件监控示例
 * 专注于watchTools.setFileChangeCallback的基本用法
 */
const fs = require('fs');
const path = require('path');
const watchTools = require('../tools/watch-tools');
const { setTimeout } = require('timers/promises');

// 配置路径
const EXAMPLE_DIR = path.resolve(__dirname, '../../temp/basic-monitor');
const TEST_FILE = path.join(EXAMPLE_DIR, 'test.txt');

/**
 * 创建测试文件
 */
function createTestFile() {
  console.log('创建测试环境...');
  
  // 确保目录存在
  if (!fs.existsSync(EXAMPLE_DIR)) {
    fs.mkdirSync(EXAMPLE_DIR, { recursive: true });
    console.log(`创建目录: ${EXAMPLE_DIR}`);
  }
  
  // 创建测试文件
  fs.writeFileSync(TEST_FILE, '这是测试文件的初始内容', 'utf8');
  console.log(`创建测试文件: ${TEST_FILE}`);
}

/**
 * 设置文件监控
 * @returns {Object} 文件监控器
 */
function setupMonitor() {
  console.log('\n设置文件监控...');
  
  // 使用setFileChangeCallback设置文件变更监控
  const watcher = watchTools.setFileChangeCallback(TEST_FILE, (event, filePath) => {
    console.log(`\n[文件事件] ${event}: ${filePath}`);
    
    if (event === 'change') {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        console.log(`文件内容: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`);
      } catch (err) {
        console.log('无法读取文件内容 (文件可能正在被写入)');
      }
    } else if (event === 'unlink') {
      console.log('文件已被删除');
    }
  });
  
  if (watcher) {
    console.log('文件监控已成功设置');
  } else {
    console.error('文件监控设置失败');
  }
  
  return watcher;
}

/**
 * 执行文件操作以触发事件
 */
async function performFileOperations() {
  console.log('\n执行文件操作...');
  
  // 等待监控器准备就绪
  await setTimeout(1000);
  
  try {
    // 修改文件
    console.log('\n1. 修改文件内容');
    fs.appendFileSync(TEST_FILE, '\n这是新增的内容', 'utf8');
    await setTimeout(1000);
    
    // 覆盖文件
    console.log('\n2. 覆盖文件内容');
    fs.writeFileSync(TEST_FILE, '这是全新的内容', 'utf8');
    await setTimeout(1000);
    
    // 删除文件
    console.log('\n3. 删除文件');
    fs.unlinkSync(TEST_FILE);
    await setTimeout(1000);
    
    // 重新创建文件
    console.log('\n4. 重新创建文件');
    fs.writeFileSync(TEST_FILE, '这是重新创建后的内容', 'utf8');
    await setTimeout(1000);
    
  } catch (error) {
    console.error('文件操作过程中出错:', error);
  }
}

/**
 * 清理环境
 * @param {Object} watcher - 文件监控器实例
 */
async function cleanup(watcher) {
  console.log('\n清理环境...');
  
  // 关闭监控器
  if (watcher) {
    watchTools.closeWatcher(watcher);
    console.log('文件监控器已关闭');
    
    // 显示监控池状态
    const poolStatus = watchTools.getMonitorPoolStatus();
    console.log('监控池状态:', JSON.stringify(poolStatus, null, 2));
  }
  
  // 删除测试文件和目录
  try {
    if (fs.existsSync(TEST_FILE)) {
      fs.unlinkSync(TEST_FILE);
      console.log(`删除测试文件: ${TEST_FILE}`);
    }
    
    if (fs.existsSync(EXAMPLE_DIR)) {
      fs.rmdirSync(EXAMPLE_DIR);
      console.log(`删除测试目录: ${EXAMPLE_DIR}`);
    }
  } catch (error) {
    console.error('清理过程中出错:', error);
  }
}

/**
 * 运行示例
 */
async function run() {
  console.log('===== 基础文件监控示例 =====');
  
  try {
    // 创建测试文件
    createTestFile();
    
    // 设置监控
    const watcher = setupMonitor();
    
    // 执行文件操作
    await performFileOperations();
    
    // 清理环境
    await cleanup(watcher);
    
    console.log('\n===== 示例完成 =====');
  } catch (error) {
    console.error('示例执行过程中出错:', error);
  }
}

// 执行示例
run(); 