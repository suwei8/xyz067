/**
 * 配置文件验证脚本
 * 用于检查 config.json 的有效性和预览过滤效果
 */
const fs = require('fs');
const path = require('path');

function validateConfig() {
  const configPath = path.resolve(process.cwd(), 'config.json');
  
  console.log('🔍 正在验证配置文件...\n');
  
  // 检查配置文件是否存在
  if (!fs.existsSync(configPath)) {
    console.log('⚠️  配置文件 config.json 不存在，将使用默认配置');
    return;
  }
  
  try {
    // 读取并解析配置文件
    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);
    
    console.log('✅ 配置文件格式正确\n');
    
    // 验证必需的配置项
    const requiredFields = {
      'scan.start': config.scan?.start,
      'scan.end': config.scan?.end,
      'scan.concurrency': config.scan?.concurrency,
      'scan.targetSnippet': config.scan?.targetSnippet,
      'filter.skipNumbers': config.filter?.skipNumbers,
      'output.resultFile': config.output?.resultFile,
      'output.errorFile': config.output?.errorFile
    };
    
    console.log('📋 配置项检查:');
    for (const [field, value] of Object.entries(requiredFields)) {
      const status = value !== undefined ? '✅' : '❌';
      console.log(`  ${status} ${field}: ${value}`);
    }
    
    // 预览扫描范围和过滤效果
    if (config.scan?.start && config.scan?.end) {
      const { start, end } = config.scan;
      const { skipNumbers = [], skipPatterns = [] } = config.filter || {};
      
      console.log(`\n🎯 扫描范围: ${start} - ${end}`);
      
      // 生成域名列表并应用过滤
      const allNumbers = Array.from({ length: end - start + 1 }, (_, i) => start + i);
      const filteredNumbers = allNumbers.filter(n => {
        const domainStr = n.toString();
        
        // 检查跳过的数字
        for (const skipNum of skipNumbers) {
          if (domainStr.includes(skipNum.toString())) {
            return false;
          }
        }
        
        // 检查跳过的模式
        for (const pattern of skipPatterns) {
          try {
            const regex = new RegExp(pattern);
            if (regex.test(domainStr)) {
              return false;
            }
          } catch (error) {
            console.warn(`⚠️  无效的正则模式: ${pattern}`);
          }
        }
        
        return true;
      });
      
      const skippedCount = allNumbers.length - filteredNumbers.length;
      
      console.log(`📊 统计信息:`);
      console.log(`  总域名数: ${allNumbers.length}`);
      console.log(`  将扫描: ${filteredNumbers.length}`);
      console.log(`  将跳过: ${skippedCount}`);
      
      if (skipNumbers.length > 0) {
        console.log(`\n🚫 跳过包含数字: [${skipNumbers.join(', ')}]`);
        
        // 显示被跳过的域名示例（最多10个）
        const skippedExamples = allNumbers
          .filter(n => !filteredNumbers.includes(n))
          .slice(0, 10);
        
        if (skippedExamples.length > 0) {
          console.log(`  跳过的域名示例: ${skippedExamples.map(n => n + '.xyz').join(', ')}${skippedExamples.length < skippedCount ? '...' : ''}`);
        }
      }
      
      if (skipPatterns.length > 0) {
        console.log(`\n🔍 跳过正则模式: [${skipPatterns.join(', ')}]`);
      }
      
      // 显示将要扫描的域名示例（最多10个）
      if (filteredNumbers.length > 0) {
        const scanExamples = filteredNumbers.slice(0, 10);
        console.log(`\n✅ 将扫描的域名示例: ${scanExamples.map(n => n + '.xyz').join(', ')}${scanExamples.length < filteredNumbers.length ? '...' : ''}`);
      }
    }
    
    console.log('\n🎉 配置验证完成！');
    
  } catch (error) {
    console.error('❌ 配置文件解析失败:', error.message);
    console.log('\n💡 请检查 JSON 格式是否正确，或参考 config.example.json');
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  validateConfig();
}

module.exports = { validateConfig };