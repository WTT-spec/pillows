/**
 * @file
 * OneNet MQTT pub/sub demo: 支持订阅云端指令并定时上报本地数据，并实现ADC采集闭环控制（四通道独立控制）
 */
#include "FreeRTOS_POSIX.h" // FreeRTOS POSIX兼容头文件
#include <unistd.h>         // UNIX标准函数
#include <stdlib.h>         // 标准库
#include <stdio.h>          // 标准输入输出
#include <sys/socket.h>     // 套接字相关
#include <sys/types.h>      // 类型定义
#include <lwip/errno.h>     // lwIP错误码
#include <netdb.h>          // 网络数据库操作
#include "utils_getopt.h"   // 工具函数
#include "mqtt.h"           // MQTT协议相关
#include "shell.h"          // shell命令相关
#include "bflb_mtimer.h"    // 定时器
//#include "bflb_pwm_v2.h"    // PWM驱动
#include "bflb_clock.h"     // 时钟相关
#include "board.h"          // 板级支持包
#include "bflb_dma.h"       // DMA驱动
#include "bflb_adc.h"       // ADC驱动
#include "bflb_gpio.h"      // GPIO驱动
#include "bflb_timer.h"
#include "bflb_l1c.h"
#include "bflb_uart.h"

// 全局变量和定义
struct bflb_device_s *uartx;
struct bflb_device_s *gpio;
struct bflb_device_s *dma0_ch0;   // 用于ADC DMA
struct bflb_device_s *dma0_ch1;   // 用于UART RX DMA
struct bflb_device_s *adc;        // ADC设备句柄
struct bflb_device_s *timer0;     // 定时器句柄

int snore; // 止鼾标志，已提升为全局变量
volatile uint8_t preference_override = 0; // 0: 用初始值，1: 用小程序参数

// ADC DMA采样数据缓存
#define TEST_ADC_CHANNELS 4
#define TEST_COUNT 1
static ATTR_NOCACHE_NOINIT_RAM_SECTION uint32_t adc_raw_data[TEST_ADC_CHANNELS * TEST_COUNT];

// 均值滤波相关
#define FILTER_WINDOW 3
uint32_t channel_sum[TEST_ADC_CHANNELS] = {0};
uint32_t channel_count[TEST_ADC_CHANNELS] = {0};
float channel_avg[TEST_ADC_CHANNELS] = {0};

// DMA传输完成标志
static volatile uint8_t dma_tc_flag0 = 0; // ADC
static volatile uint8_t dma_tc_flag1 = 0; // UART RX

// 采集使能标志
volatile uint8_t adc_collect_enable = 1; // 1秒后开始ADC DMA采集
volatile uint8_t uart_collect_enable = 5; // 5秒后开始UART DMA接收
volatile uint8_t simulatesnore = 0; // 模拟止鼾标志位，0: 正常接收UART，1: 不接收UART
volatile uint8_t gpio_collect_enable = 1; // 1秒后开始GPIO采集

// 控制定时动作的标志位
volatile uint8_t control_enable = 0;

// GPIO输入状态变量，存储GPIO_PIN_11的当前状态，其他函数可直接访问
volatile uint8_t gpio_input_state = 0;

// LED闪烁相关变量
volatile uint8_t clock_on = 0; // 标志位，1时闪烁,即开启闹钟；0时不闪烁，即关闭闹钟
volatile uint8_t led_blink_state = 0; // 当前LED状态
uint32_t led_blink_gpio_pin = GPIO_PIN_15; // 默认LED引脚，可修改

// LED闪烁频率相关
// led_blink_div：LED闪烁分频参数，表示每led_blink_div次定时器中断才切换一次LED状态。
// 例如定时器1秒一次，led_blink_div=2，则LED每2秒闪烁一次（亮/灭各1秒）；led_blink_div=5，则每5秒闪烁一次。
// 数值越大，闪烁越慢；数值越小，闪烁越快（最小为1，每次定时器中断都切换）。
volatile uint16_t led_blink_div = 2; // 默认2，用户可动态调整
volatile uint16_t led_blink_cnt = 0; // 定时器计数器，自动归零，无需手动修改

// ===================== MQTT参数配置 =====================
#define ADDRESS     "183.230.40.96" // OneNet服务器地址
#define PORT        "1883"          // MQTT端口
#define CLIENTID    "room00"        // 设备ID
#define USERNAME    "vg3Awbo66L"    // 产品ID
#define PASSWORD    "version=2018-10-31&res=products%2Fvg3Awbo66L%2Fdevices%2Froom00&et=3762979200&method=md5&sign=zin7i6UtzIi8jtevutpyIA%3D%3D" // 鉴权信息
#define SUBTOPIC    "$sys/vg3Awbo66L/room00/thing/property/set"   // 云端下发属性主题
#define PUBTOPIC    "$sys/vg3Awbo66L/room00/thing/property/post"  // 设备上报属性主题

uint8_t sendbuf[2048];   // MQTT发送缓冲区
uint8_t recvbuf[1024];   // MQTT接收缓冲区
uint8_t message[512];    // 上报消息缓冲区

shell_sig_func_ptr abort_exec; // shell信号处理
static TaskHandle_t client_daemon; // MQTT后台任务句柄
int test_sockfd;                  // MQTT socket句柄
const char* addr;                 // MQTT服务器地址

struct mqtt_client client;

// ========== 你的本地业务相关全局变量 ==========

// UART DMA接收缓冲区，接收66字节数据
static ATTR_NOCACHE_NOINIT_RAM_SECTION uint8_t uart_rx_buffer[66] = { 0 };
// 用于存储最后三个字节，第三个字节除以10后存入
static uint8_t last_three_bytes[3] = { 0, 0, 0 };

/*ADC引脚 */
/*0 , 1 ，2 ，3 ，4 ，5 ，6 ，7 ，8 ，9 ，10，11 */
/*20，19，2 ，3 ，14，13，12，10，1 ，0 ，27，28 */
// ADC通道配置
struct bflb_adc_channel_s chan[TEST_ADC_CHANNELS] = {
    { .pos_chan = ADC_CHANNEL_4, .neg_chan = ADC_CHANNEL_GND },
    { .pos_chan = ADC_CHANNEL_5, .neg_chan = ADC_CHANNEL_GND },
    { .pos_chan = ADC_CHANNEL_6, .neg_chan = ADC_CHANNEL_GND },
    { .pos_chan = ADC_CHANNEL_7, .neg_chan = ADC_CHANNEL_GND },
};

// 每个map_idx（每个ADC→气囊映射）独立的阈值等级标志位
uint8_t adc_threshold_flag_arr[4] = {1, 1, 1, 1}; // 可根据需要初始化不同等级

// 正常模式下仰睡和侧睡的阈值数组
const uint8_t normal_mode_supine[4] = {1, 1, 1, 1};   // 仰睡
const uint8_t normal_mode_lateral[4] = {1,1,1,1};  // 侧睡

// 定义每个通道的7档阈值（低/高），顺序与adc_pwm_map一致：ADC_CHANNEL_4, 5, 6, 7
const uint32_t adc_channel_thresholds[][7][2] = {
{ {500, 700}, {700, 900}, {900, 1100}, {1100,1300}, {1300, 1500}, {1500, 1700}, {1700, 2000} }, // ADC_CHANNEL_4
{ {500, 700}, {700, 800}, {800, 900}, {900,1000}, {1000, 1200}, {1200, 1400}, {1400, 1700} }, // ADC_CHANNEL_5
{ {500, 700}, {700, 800}, {800, 900}, {900,1000}, {1000, 1200}, {1200, 1400}, {1400, 1700} }, // ADC_CHANNEL_6
{ {300, 500}, {500, 700}, {700, 900}, {900, 1200}, {1200, 1600}, {1600, 2000}, {2000, 2600} } // ADC_CHANNEL_7
};

// 模式定义
typedef enum {
    MODE_NORMAL = 0,      // 正常运行模式
    MODE_SNORE = 1,       // 止鼾模式（正常模式下的子模式）
    MODE_CERVICAL = 2,     // 颈椎牵引模式
    MODE_CUSTOM = 3 // 可选的其他模式
} work_mode_t;

// 止鼾模式左转/右转标志位，0: 左转，1: 右转
uint8_t snore_turn_flag = 0;

// 当前工作模式，默认其他模式
volatile work_mode_t current_mode = 3; 

// 控制打印频率的全局标志
volatile uint8_t allow_print = 0;

//  ========== 函数声明 ==========
void led_init(void);               // 气囊相关GPIO初始化
void dma0_ch0_isr(void *arg);
void dma0_ch1_isr(void *arg);
void timer0_isr(int irq, void *arg);
void adc_dma_start(void);
void uart_dma_start(void);
void adc_process_result(void);
void uart_process_result(void);
void uart_init(void);
void adc_init(void);
void app_dma_init(void);
void timer_init(void);


void check_adc_and_control(void); // 检查 ADC 并控制
void cervical_traction_mode_control(void); // 颈椎牵引模式控制函数
void snore_mode_control(void); // 止鼾模式控制函数
void led_blink_timer_control(void); // LED闪烁控制函数//震动电机
void normal_mode_control(void); // 正常模式控制函数


// 定义 ADC 通道与 GPIO 引脚的映射表
typedef struct {
    uint8_t adc_channel; // ADC 通道号
    uint32_t gpio_valve; // 电磁阀 GPIO 引脚
    uint32_t gpio_pump;  // 气泵 GPIO 引脚
} adc_gpio_mapping_t;

//四通道气囊映射表
const adc_gpio_mapping_t adc_gpio_map[] = {
    { ADC_CHANNEL_4, GPIO_PIN_25, GPIO_PIN_17 },
    { ADC_CHANNEL_5, GPIO_PIN_26, GPIO_PIN_18 },
    { ADC_CHANNEL_6, GPIO_PIN_27, GPIO_PIN_19 },
    { ADC_CHANNEL_7, GPIO_PIN_28, GPIO_PIN_20 }
};

// ========== 硬件相关实现 ==========

// ADC DMA完成中断服务函数
void dma0_ch0_isr(void *arg)
{
    dma_tc_flag0++;
    adc_process_result();
    printf("ADC DMA done\r\n");
}

// UART RX DMA完成中断服务函数
void dma0_ch1_isr(void *arg)
{
    dma_tc_flag1++;
    uart_process_result();
    printf("UART RX DMA done\r\n");
}

// 定时器中断服务函数，1秒触发一次ADC+DMA采集
void timer0_isr(int irq, void *arg)
{
    bool status = bflb_timer_get_compint_status(timer0, TIMER_COMP_ID_0);
    if (status) {
        bflb_timer_compint_clear(timer0, TIMER_COMP_ID_0);

        allow_print++; // 每秒允许打印一次
        control_enable = 3; // 1.5秒定时触发一次

        if (adc_collect_enable) {
            adc_dma_start();
        }
        if (uart_collect_enable && simulatesnore == 0) {
            uart_dma_start();
        }
        if (gpio_collect_enable) {
            gpio_input_state = bflb_gpio_read(gpio, GPIO_PIN_11); // 读取GPIO状态并存入变量
            printf("GPIO done\r\n");
            printf("GPIO_PIN_11 state: %x\r\n", gpio_input_state);
        }
        led_blink_timer_control();// LED闪烁控制，每秒调用一次
    }
}

// ADC初始化
void adc_init(void)
{
    board_adc_gpio_init();
    adc = bflb_device_get_by_name("adc");
    struct bflb_adc_config_s adc_cfg;
    adc_cfg.clk_div = ADC_CLK_DIV_32;
    adc_cfg.scan_conv_mode = true;
    adc_cfg.continuous_conv_mode = false;
    adc_cfg.differential_mode = false;
    adc_cfg.resolution = ADC_RESOLUTION_16B;
    adc_cfg.vref = ADC_VREF_3P2V;
    bflb_adc_init(adc, &adc_cfg);
    bflb_adc_channel_config(adc, chan, TEST_ADC_CHANNELS);
    bflb_adc_link_rxdma(adc, true);
}
// UART初始化（用于printf打印）
void uart_init(void)
{
    board_uartx_gpio_init();
    uartx = bflb_device_get_by_name(DEFAULT_TEST_UART);
    struct bflb_uart_config_s cfg;
    cfg.baudrate = 115200;
    cfg.data_bits = UART_DATA_BITS_8;
    cfg.stop_bits = UART_STOP_BITS_1;
    cfg.parity = UART_PARITY_NONE;
    cfg.flow_ctrl = 0;
    cfg.tx_fifo_threshold = 7;
    cfg.rx_fifo_threshold = 0;
    bflb_uart_init(uartx, &cfg);
    bflb_uart_link_rxdma(uartx, true);
}
// DMA通道初始化
void app_dma_init(void)
{
    dma0_ch0 = bflb_device_get_by_name("dma0_ch0"); // ADC DMA
    dma0_ch1 = bflb_device_get_by_name("dma0_ch1"); // UART RX DMA

    // 配置ADC DMA通道参数
    struct bflb_dma_channel_config_s adc_dma_cfg;
    adc_dma_cfg.direction = DMA_PERIPH_TO_MEMORY;
    adc_dma_cfg.src_req = DMA_REQUEST_ADC;
    adc_dma_cfg.dst_req = DMA_REQUEST_NONE;
    adc_dma_cfg.src_addr_inc = DMA_ADDR_INCREMENT_DISABLE;
    adc_dma_cfg.dst_addr_inc = DMA_ADDR_INCREMENT_ENABLE;
    adc_dma_cfg.src_burst_count = DMA_BURST_INCR1;
    adc_dma_cfg.dst_burst_count = DMA_BURST_INCR1;
    adc_dma_cfg.src_width = DMA_DATA_WIDTH_32BIT;
    adc_dma_cfg.dst_width = DMA_DATA_WIDTH_32BIT;
    bflb_dma_channel_init(dma0_ch0, &adc_dma_cfg);
    bflb_dma_channel_irq_attach(dma0_ch0, dma0_ch0_isr, NULL);

    // 配置UART RX DMA通道参数
    struct bflb_dma_channel_config_s uart_dma_cfg;
    uart_dma_cfg.direction = DMA_PERIPH_TO_MEMORY;
    uart_dma_cfg.src_req = DEFAULT_TEST_UART_DMA_RX_REQUEST;
    uart_dma_cfg.dst_req = DMA_REQUEST_NONE;
    uart_dma_cfg.src_addr_inc = DMA_ADDR_INCREMENT_DISABLE;
    uart_dma_cfg.dst_addr_inc = DMA_ADDR_INCREMENT_ENABLE;
    uart_dma_cfg.src_burst_count = DMA_BURST_INCR1;
    uart_dma_cfg.dst_burst_count = DMA_BURST_INCR1;
    uart_dma_cfg.src_width = DMA_DATA_WIDTH_8BIT;
    uart_dma_cfg.dst_width = DMA_DATA_WIDTH_8BIT;
    bflb_dma_channel_init(dma0_ch1, &uart_dma_cfg);
    bflb_dma_channel_irq_attach(dma0_ch1, dma0_ch1_isr, NULL);

    // 启动ADC DMA（UART DMA由定时器统一启动）
    adc_dma_start();
}

// LED闪烁控制函数：标志位为1时，每次定时器中断切换LED状态，实现闪烁
void led_blink_timer_control(void)
{
    printf("LED done\r\n");
    if (clock_on) {
        led_blink_cnt++;
        if (led_blink_cnt >= led_blink_div) {
            led_blink_cnt = 0;
            if (led_blink_state) {
                bflb_gpio_reset(gpio, led_blink_gpio_pin); // 熄灭
                led_blink_state = 0;
            } else {
                bflb_gpio_set(gpio, led_blink_gpio_pin);   // 点亮
                led_blink_state = 1;
            }
        }
    } else {
        // 标志位为0时确保LED熄灭
        bflb_gpio_reset(gpio, led_blink_gpio_pin);
        led_blink_state = 0;
        led_blink_cnt = 0;
    }
}
// 启动ADC DMA采集
void adc_dma_start(void)
{
    struct bflb_dma_channel_lli_pool_s adc_llipool[1];
    struct bflb_dma_channel_lli_transfer_s adc_transfers[1];
    adc_transfers[0].src_addr = (uint32_t)DMA_ADDR_ADC_RDR;
    adc_transfers[0].dst_addr = (uint32_t)adc_raw_data;
    adc_transfers[0].nbytes = sizeof(adc_raw_data);
    bflb_dma_channel_lli_reload(dma0_ch0, adc_llipool, 1, adc_transfers, 1);
    bflb_dma_channel_start(dma0_ch0);
    bflb_adc_start_conversion(adc);
}
// 启动UART RX DMA接收
void uart_dma_start(void)
{
    struct bflb_dma_channel_lli_pool_s uart_llipool[4];
    struct bflb_dma_channel_lli_transfer_s uart_transfers[1];
    uart_transfers[0].src_addr = (uint32_t)DEFAULT_TEST_UART_DMA_RDR;
    uart_transfers[0].dst_addr = (uint32_t)uart_rx_buffer;
    uart_transfers[0].nbytes = 66;
    bflb_dma_channel_lli_reload(dma0_ch1, uart_llipool, 4, uart_transfers, 1);
    bflb_dma_channel_start(dma0_ch1);
}
// 处理ADC采集结果并做均值滤波
void adc_process_result(void)
{
    for (size_t ch = 0; ch < TEST_ADC_CHANNELS; ch++) {
        for (size_t i = 0; i < TEST_COUNT; i++) {
            struct bflb_adc_result_s result;
            size_t index = ch * TEST_COUNT + i;

       // printf("ADC1\r\n");    
            bflb_adc_parse_result(adc, &adc_raw_data[index], &result, 1);
            channel_sum[ch] += result.millivolt;
            channel_count[ch]++;
            if (channel_count[ch] == FILTER_WINDOW) {
               // printf("ADC2\r\n");    
                channel_avg[ch] = channel_sum[ch] / (float)FILTER_WINDOW;
                printf("ADC通道 %zu 均值: %.2f mV\r\n", ch, channel_avg[ch]);
                channel_sum[ch] = 0;
                channel_count[ch] = 0;
            }
        }
    }
}

// 处理UART DMA接收结果，并处理最后三个字节
void uart_process_result(void)
{
    // 查找数据中是否包含"Bdata"
    int found = 0;
    for (uint8_t i = 0; i <= 66 - 9; i++) { // 至少要有Bdata+1+3=9字节剩余
        if (uart_rx_buffer[i] == 'B' &&
            uart_rx_buffer[i+1] == 'd' &&
            uart_rx_buffer[i+2] == 'a' &&
            uart_rx_buffer[i+3] == 't' &&
            uart_rx_buffer[i+4] == 'a') 
        {
            // 跳过1字节（uart_rx_buffer[i+5]），取后3字节
            //uint8_t last_three_bytes[3];
            last_three_bytes[0] = uart_rx_buffer[i+6];
            last_three_bytes[1] = uart_rx_buffer[i+7];
            last_three_bytes[2] = uart_rx_buffer[i+8];
            printf("last_three_bytes: %02X %u %u\r\n", last_three_bytes[0], last_three_bytes[1], last_three_bytes[2]/10);
            found = 1;
            break;
        }
    }
    if (!found) {
        printf("数据格式错误,未检测到Bdata头\r\n");
    }
}

// 定时器初始化（1秒触发一次ADC+DMA采集）
void timer_init(void)
{
    timer0 = bflb_device_get_by_name("timer0");
    struct bflb_timer_config_s tcfg;
    tcfg.counter_mode = TIMER_COUNTER_MODE_PROLOAD;
    tcfg.clock_source = TIMER_CLKSRC_XTAL;
    tcfg.clock_div = 39; // 40分频，1MHz
    tcfg.trigger_comp_id = TIMER_COMP_ID_0;
    tcfg.comp0_val = 1000000; // 1秒
    tcfg.comp1_val = 0;
    tcfg.comp2_val = 0;
    tcfg.preload_val = 0;
    bflb_timer_init(timer0, &tcfg);
    bflb_irq_attach(timer0->irq_num, timer0_isr, NULL);
    bflb_irq_enable(timer0->irq_num);
    bflb_timer_start(timer0);
}

// 电磁阀与气泵初始化
void led_init(void) {
    gpio = bflb_device_get_by_name("gpio"); // 获取 GPIO 设备句柄
    // 初始化4个GPIO通道，分别对应4个电磁阀
    bflb_gpio_init(gpio, GPIO_PIN_26, GPIO_OUTPUT | GPIO_PULLUP | GPIO_SMT_EN | GPIO_DRV_0);
    bflb_gpio_init(gpio, GPIO_PIN_25, GPIO_OUTPUT | GPIO_PULLUP | GPIO_SMT_EN | GPIO_DRV_0);
    bflb_gpio_init(gpio, GPIO_PIN_27, GPIO_OUTPUT | GPIO_PULLUP | GPIO_SMT_EN | GPIO_DRV_0);
    bflb_gpio_init(gpio, GPIO_PIN_28, GPIO_OUTPUT | GPIO_PULLUP | GPIO_SMT_EN | GPIO_DRV_0);
    // 初始化4个GPIO通道，分别对应4个气泵
    bflb_gpio_init(gpio, GPIO_PIN_17, GPIO_OUTPUT | GPIO_PULLUP | GPIO_SMT_EN | GPIO_DRV_0);
    bflb_gpio_init(gpio, GPIO_PIN_18, GPIO_OUTPUT | GPIO_PULLUP | GPIO_SMT_EN | GPIO_DRV_0);
    bflb_gpio_init(gpio, GPIO_PIN_19, GPIO_OUTPUT | GPIO_PULLUP | GPIO_SMT_EN | GPIO_DRV_0);
    bflb_gpio_init(gpio, GPIO_PIN_20, GPIO_OUTPUT | GPIO_PULLUP | GPIO_SMT_EN | GPIO_DRV_0);
    
    bflb_gpio_init(gpio, GPIO_PIN_15, GPIO_OUTPUT | GPIO_PULLUP | GPIO_SMT_EN | GPIO_DRV_0);
    bflb_gpio_init(gpio, GPIO_PIN_11, GPIO_INPUT | GPIO_PULLUP | GPIO_SMT_EN | GPIO_DRV_0);

    // 默认全部关闭（GPIO输出低，表示“关闭”）
    bflb_gpio_set(gpio, GPIO_PIN_26);
    bflb_gpio_set(gpio, GPIO_PIN_25);
    bflb_gpio_set(gpio, GPIO_PIN_27);
    bflb_gpio_set(gpio, GPIO_PIN_28);

    bflb_gpio_reset(gpio, GPIO_PIN_17);
    bflb_gpio_reset(gpio, GPIO_PIN_18);
    bflb_gpio_reset(gpio, GPIO_PIN_19);
    bflb_gpio_reset(gpio, GPIO_PIN_20);

    bflb_gpio_reset(gpio, GPIO_PIN_15);
}

// ===================== 业务逻辑实现 =====================

// 检查ADC并控制气囊
void check_adc_and_control(void) {
    if (current_mode == MODE_SNORE) { 
        snore_mode_control(); // 调用止鼾模式控制函数
    } 
    if (current_mode == MODE_CERVICAL) { 
       cervical_traction_mode_control(); //颈椎牵引模式控制函数
    } 
    if (current_mode == MODE_NORMAL) { 
       normal_mode_control(); // 正常模式控制函数
    } 
    for (size_t ch = 0; ch < TEST_ADC_CHANNELS; ch++) {
        float avg_value = channel_avg[ch];
        for (size_t j = 0; j < sizeof(adc_gpio_map) / sizeof(adc_gpio_map[0]); j++) {
            if (chan[ch].pos_chan == adc_gpio_map[j].adc_channel) {
                size_t map_idx = j;
                uint8_t flag = adc_threshold_flag_arr[map_idx];
                if (flag < 1 || flag > 7) {
                    if (allow_print) printf("无效的 ADC 阈值标志位: %d (map_idx=%d)\r\n", flag, (int)map_idx);
                    break;
                }
                uint32_t threshold_low = adc_channel_thresholds[map_idx][flag - 1][0];
                uint32_t threshold_high = adc_channel_thresholds[map_idx][flag - 1][1];
                uint32_t gpio_valve = adc_gpio_map[map_idx].gpio_valve;
                uint32_t gpio_pump = adc_gpio_map[map_idx].gpio_pump;
                if (avg_value < threshold_low) {
                    bflb_gpio_set(gpio, gpio_pump);      // 气泵开
                    bflb_gpio_reset(gpio, gpio_valve);   // 电磁阀关
                    if (allow_print==5) printf("气泵%d开, 电磁阀%d关, 气压 CH%d: %.2f mV, 阈值: [%lu, %lu], flag=%d\r\n", gpio_pump, gpio_valve, chan[ch].pos_chan, avg_value, threshold_low, threshold_high, flag);
                } else if (avg_value > threshold_high) {
                    bflb_gpio_reset(gpio, gpio_pump);    // 气泵关
                    bflb_gpio_set(gpio, gpio_valve);     // 电磁阀开
                    if (allow_print==5) printf("气泵%d关, 电磁阀%d开, 气压 CH%d: %.2f mV, 阈值: [%lu, %lu], flag=%d\r\n", gpio_pump, gpio_valve, chan[ch].pos_chan, avg_value, threshold_low, threshold_high, flag);
                } else {
                    bflb_gpio_reset(gpio, gpio_pump);    // 气泵关
                    bflb_gpio_reset(gpio, gpio_valve);   // 电磁阀关
                    if (allow_print==5) printf("气泵%d关, 电磁阀%d关, 气压 CH%d: %.2f mV, 阈值: [%lu, %lu], flag=%d\r\n", gpio_pump, gpio_valve, chan[ch].pos_chan, avg_value, threshold_low, threshold_high, flag);
                }
                break;
            }
        }
    }
    if (allow_print==5) allow_print = 0;
}
// 颈椎牵引模式控制函数：PWM3的ADC阈值级别从1级到7级循环
void cervical_traction_mode_control(void) {
    static uint8_t level = 1; // 当前级别，1~7
    static int8_t direction = 1; // 1为升序，-1为降序
    static uint32_t last_tick = 0;
    uint32_t now_tick = bflb_mtimer_get_time_ms();
    // 每5秒切换一次级别
    if (now_tick - last_tick > 5000) {
        last_tick = now_tick;
        level += direction;
        if (level >= 7) {
            level = 7;
            direction = -1; // 到顶后反向
        } else if (level <= 1) {
            level = 1;
            direction = 1; // 到底后正向
        }
        adc_threshold_flag_arr[3] = level; // 牵引模式对应map_idx=3（ADC_CHANNEL_7）
        printf("[颈椎牵引模式] 通道7阈值级别切换为: %d\r\n", level);
    }
}
// 止鼾模式控制函数
void snore_mode_control(void) {
    // 检查last_three_bytes[0]是否为3
    if (snore == 1) {
        // 止鼾模式只调整阈值
        if (snore_turn_flag == 0) {
            adc_threshold_flag_arr[1] = 7; // ADC_CHANNEL_5（map_idx=1）设置为7级
            printf("[止鼾模式] 左转, 通道5阈值设置为7级\r\n");
        } else {
            adc_threshold_flag_arr[2] = 7; // ADC_CHANNEL_6（map_idx=2）设置为7级
            printf("[止鼾模式] 右转, 通道6阈值设置为7级\r\n");
        }
    } else {
        // 非打鼾状态，阈值恢复为1
        if (snore_turn_flag == 0) {
            adc_threshold_flag_arr[1] = 1; // ADC_CHANNEL_5（map_idx=1）恢复为1级
            printf("[止鼾模式] 左转, 通道5阈值恢复为1级\r\n");
        } else {
            adc_threshold_flag_arr[2] = 1; // ADC_CHANNEL_6（map_idx=2）恢复为1级
            printf("[止鼾模式] 右转, 通道6阈值恢复为1级\r\n");
        }
    }
}
// 正常模式控制函数
/*void normal_mode_control(void) {
    if (gpio_input_state == 1) { // 仰睡
        memcpy(adc_threshold_flag_arr, normal_mode_supine, sizeof(adc_threshold_flag_arr));
        printf("[正常模式] 仰睡\r\n");
    } else { // 侧睡
        memcpy(adc_threshold_flag_arr, normal_mode_lateral, sizeof(adc_threshold_flag_arr));
        printf("[正常模式] 侧睡\r\n");
    }
}*/
void normal_mode_control(void) {
    if (preference_override == 0) {
        if (gpio_input_state == 1) { // 仰睡
            memcpy(adc_threshold_flag_arr, normal_mode_supine, sizeof(adc_threshold_flag_arr));
            printf("[正常模式] 仰睡（初始值）\r\n");
        } else { // 侧睡
            memcpy(adc_threshold_flag_arr, normal_mode_lateral, sizeof(adc_threshold_flag_arr));
            printf("[正常模式] 侧睡（初始值）\r\n");
        }
    } else {
        printf("[正常模式] 已根据小程序偏好指令调整气囊高度\r\n");
        // 不覆盖 adc_threshold_flag_arr，直接用小程序参数
    }
}

// ========== MQTT相关 ==========

// 打开非阻塞socket连接
static int open_nb_socket(const char* addr, const char* port) 
{
    struct addrinfo hints = {0}; // 地址信息结构体
    hints.ai_family = AF_UNSPEC; // 支持IPv4/IPv6
    hints.ai_socktype = SOCK_STREAM; // TCP
    int sockfd = -1; // socket句柄
    int rv;
    struct addrinfo *p, *servinfo;
    rv = getaddrinfo(addr, port, &hints, &servinfo); // 获取服务器地址
    if(rv != 0) 
    {
        printf("Failed to open socket (getaddrinfo): %s\r\n", rv);
        return -1;
    }
    for(p = servinfo; p != NULL; p = p->ai_next) // 遍历所有地址
    { 
        sockfd = socket(p->ai_family, p->ai_socktype, p->ai_protocol); // 创建socket
        if (sockfd == -1) continue;
        rv = connect(sockfd, p->ai_addr, p->ai_addrlen); // 连接服务器
        if(rv == -1)
         {
          close(sockfd);
          sockfd = -1;
          continue;
        }
        break;
    }
    freeaddrinfo(servinfo); // 释放地址信息
    if (sockfd != -1) 
    {
        int iMode = 1;
        ioctlsocket(sockfd, FIONBIO, &iMode); // 设置为非阻塞
    }
    return sockfd;
}

/**
 * @brief MQTT 消息回调：处理云端下发指令
 * 支持 group0~group3 四组独立调节
 */
static void publish_callback_1(void** unused, struct mqtt_response_publish *published)
{
    char* topic_name = (char*) malloc(published->topic_name_size + 1); // 分配主题名缓冲区
    memcpy(topic_name, published->topic_name, published->topic_name_size); // 拷贝主题名
    topic_name[published->topic_name_size] = '\0'; // 字符串结尾

    char* topic_msg = (char*) malloc(published->application_message_size + 1); // 分配消息体缓冲区
    memcpy(topic_msg, published->application_message, published->application_message_size); // 拷贝消息体
    topic_msg[published->application_message_size] = '\0'; // 字符串结尾

    printf("Received publish('%s'): %s\r\n", topic_name, topic_msg); // 打印收到的消息
    

    // 解析气囊工作模式 current_mode
    char *p_mode = strstr(topic_msg, "\"current_mode\"");
    if (p_mode) {
        p_mode = strchr(p_mode, ':');
        if (p_mode) {
            p_mode++;
            while (*p_mode == ' ' || *p_mode == '\t') p_mode++;
            int mode = 0;
            if (sscanf(p_mode, "%d", &mode) == 1) {
                if (mode >= 0 && mode <= 3) {
                    current_mode = (work_mode_t)mode;
                    printf("Set current_mode = %d\r\n", mode);
                }
            }
        }
    }

    // 解析止鼾模式标志位 snore_turn_flag
    char *p_snore = strstr(topic_msg, "\"snore_turn_flag\"");
    if (p_snore) {
        p_snore = strchr(p_snore, ':');
        if (p_snore) {
            p_snore++;
            while (*p_snore == ' ' || *p_snore == '\t') p_snore++;
            // 支持 true/false 或 0/1
            if (strncmp(p_snore, "true", 4) == 0 || strncmp(p_snore, "1", 1) == 0) {
                snore_turn_flag = 1;
                printf("Set snore_turn_flag = 1 (右转)\r\n");
            } else if (strncmp(p_snore, "false", 5) == 0 || strncmp(p_snore, "0", 1) == 0) {
                snore_turn_flag = 0;
                printf("Set snore_turn_flag = 0 (左转)\r\n");
            }
        }
    }

    // 解析打鼾模拟量 simulatesnore
    char *p_simulatesnore = strstr(topic_msg, "\"simulatesnore\"");
    if (p_simulatesnore) {
        p_simulatesnore = strchr(p_simulatesnore, ':');
        if (p_simulatesnore) {
            p_simulatesnore++;
            while (*p_simulatesnore == ' ' || *p_simulatesnore == '\t') p_simulatesnore++;
            if (strncmp(p_simulatesnore, "true", 4) == 0 || strncmp(p_simulatesnore, "1", 1) == 0) {
                simulatesnore = 1;
                printf("Set simulatesnore = 1 (打鼾模拟量)\r\n");
            } else if (strncmp(p_simulatesnore, "false", 5) == 0 || strncmp(p_simulatesnore, "0", 1) == 0) {
                simulatesnore = 0;
                printf("Set simulatesnore = 0 (真实量)\r\n");
            }
        }
    }
    
    // 解析 group0~group3 的 heightX_adjustment 指令
    /*for (int group = 0; group < 4; group++) { // 遍历四组
        char key[32];
        snprintf(key, sizeof(key), "\"height%d_adjustment\"", group); // 构造key
        char *p = strstr(topic_msg, key); // 查找key
        if (p) 
        {
            p = strchr(p, ':'); // 找到冒号
            if (p) {
                p++;
                while (*p == ' ' || *p == '\t') p++; // 跳过空格
                int height = 0;
                if (sscanf(p, "%d", &height) == 1) // 解析数值
                { 
                    if (height >= 1 && height <= 7)  // 合法性检查
                    {
                        adc_threshold_flag_arr[group] = height; // 设置对应通道阈值等级
                        printf("Set adc_threshold_flag_arr[%d] = %d\r\n", group, height);

                        // 收到指令时直接设置该PWM通道到区间均值
                        uint32_t low = adc_channel_thresholds[group][height - 1][0];
                        uint32_t high = adc_channel_thresholds[group][height - 1][1];
                        uint32_t target = (low + high) / 2;
                        printf("PWM通道%d已根据height%d_adjustment=%d设置到区间[%lu,%lu]，阈值=%lu\r\n", group, group, height, low, high, target);
                    }
                }
            }
        }
    }*/
   // 解析 group0~group3 的 heightX_adjustment 指令
    int preference_updated = 0;
    for (int group = 0; group < 4; group++) {
        char key[32];
        snprintf(key, sizeof(key), "\"height%d_adjustment\"", group);
        char *p = strstr(topic_msg, key);
        if (p) {
            p = strchr(p, ':');
            if (p) {
                p++;
                while (*p == ' ' || *p == '\t') p++;
                int height = 0;
                if (sscanf(p, "%d", &height) == 1) {
                    if (height >= 1 && height <= 7) {
                        adc_threshold_flag_arr[group] = height;
                        preference_updated = 1;
                        printf("Set adc_threshold_flag_arr[%d] = %d\r\n", group, height);
                        uint32_t low = adc_channel_thresholds[group][height - 1][0];
                        uint32_t high = adc_channel_thresholds[group][height - 1][1];
                        uint32_t target = (low + high) / 2;
                        printf("PWM通道%d已根据height%d_adjustment=%d设置到区间[%lu,%lu]，阈值=%lu\r\n", group, group, height, low, high, target);
                    }
                }
            }
        }
    }
    // 正常模式/自定义模式下收到偏好参数，立即调节气囊
    if (preference_updated) {
        preference_override = 1;
        if (current_mode == MODE_NORMAL || current_mode == MODE_CUSTOM) {
            check_adc_and_control();
            printf("[气囊] 已根据小程序偏好指令调整气囊高度\r\n");
        }
    }


    //解析 clock_on指令
    char *p_clock_on = strstr(topic_msg, "\"clock_on\"");
    if (p_clock_on) {
        p_clock_on = strchr(p_clock_on, ':');
        if (p_clock_on) {
            p_clock_on++;
            while (*p_clock_on == ' ' || *p_clock_on == '\t') p_clock_on++;
            if (strncmp(p_clock_on, "true", 4) == 0 || strncmp(p_clock_on, "1", 1) == 0) {
                clock_on = 1;
                printf("Set clock_on = 1 (开启闹钟)\r\n");
            } else if (strncmp(p_clock_on, "false", 5) == 0 || strncmp(p_clock_on, "0", 1) == 0) {
                clock_on = 0;
                printf("Set clock_on = 0 (关闭闹钟)\r\n");
            }
        }
    }

    
    free(topic_name); // 释放主题名缓冲区
    free(topic_msg);  // 释放消息体缓冲区
    
}

/**
 * @brief MQTT 客户端后台维护任务
 */
static void client_refresher(void* client)
{
    while(1)
    {
        mqtt_sync((struct mqtt_client*) client); // 保持MQTT连接
        vTaskDelay(10); // 延时10ms
    }
}

/**
 * @brief 安全关闭 socket 和后台任务
 */
static void test_close(int sig)
{
    if (test_sockfd)
        close(test_sockfd); // 关闭socket
    printf("mqtt_sub disconnecting from %s\r\n", addr); // 打印断开信息
    abort_exec(sig); // 调用shell信号处理
    vTaskDelete(client_daemon); // 删除后台任务
}

/**
 * @brief MQTT pub/sub 示例主流程
 * 包含硬件初始化、MQTT连接、订阅、数据上报、闭环控制等
 */
int example_mqtt(int argc, const char *argv[]) 
{
    led_init();
    adc_init();
    uart_init();
    app_dma_init();
    timer_init();
    
    const char* port;
    const char* subtopic;
    const char* pubtopic;
    const char* username;
    const char* password;
    int ret = 0;

    abort_exec = shell_signal(1, test_close); // 注册shell信号处理

    if (argc > 1) { addr = argv[1]; } else { addr = ADDRESS; } // 解析参数
    if (argc > 2) { port = argv[2]; } else { port = PORT; }
    if (argc > 3) { subtopic = argv[3]; } else { subtopic = SUBTOPIC; }
    if (argc > 4) { username = argv[4]; } else { username = USERNAME; }
    if (argc > 5) { password = argv[5]; } else { password = PASSWORD; }
    pubtopic = PUBTOPIC;

    test_sockfd = open_nb_socket(addr, port); // 建立socket连接
    if (test_sockfd < 0) {
        printf("Failed to open socket: %d\r\n", test_sockfd);
        test_close(SHELL_SIGINT);
    }

    //struct mqtt_client client;
    mqtt_init(&client, test_sockfd, sendbuf, sizeof(sendbuf), recvbuf, sizeof(recvbuf), publish_callback_1); // 初始化MQTT客户端
    const char* client_id = CLIENTID;
    uint8_t connect_flags = MQTT_CONNECT_CLEAN_SESSION;
    ret = mqtt_connect(&client, client_id, NULL, NULL, 0, username, password, connect_flags, 400); // 连接MQTT服务器

    if (ret != MQTT_OK) {
        printf("fail \r\n");
    }
    if (client.error != MQTT_OK) {
        printf("error: %s\r\n", mqtt_error_str(client.error));
        test_close(SHELL_SIGINT);
    }

    // 启动后台维护任务
    xTaskCreate(client_refresher, (char*)"client_ref", 1024,  &client, 10, &client_daemon);

    // 订阅云端下发指令
    mqtt_subscribe(&client, subtopic, 0);

    printf("%s listening for '%s' messages.\r\n", argv[0], subtopic);
    printf("Press CTRL-C to exit.\r\n");

    // 启动时根据初始值打印各通道目标区间信息
    for (size_t group = 0; group < 4; group++) {
        uint8_t flag = adc_threshold_flag_arr[group];
        if (flag < 1 || flag > 7) flag = 6;
        uint32_t low = adc_channel_thresholds[group][flag - 1][0];
        uint32_t high = adc_channel_thresholds[group][flag - 1][1];
        uint32_t target = (low + high) / 2;
        printf("通道%d初始阈值等级=%d，对应区间=[%lu, %lu]，区间均值=%lu\r\n", (int)group, (int)flag, low, high, target);
    }
    // 定时发布本地数据，并做闭环控制
    static int request_id = 0;
    int pub_count = 0;
    while (1) 
    {
        // 模式切换与闭环控制
        switch (current_mode) {
            case MODE_NORMAL:
                printf("[正常运行模式]\r\n");
                check_adc_and_control();
                break;
            case MODE_SNORE:
                printf("[止鼾模式]\r\n");
                check_adc_and_control(); // 止鼾模式下也用同一控制函数，可在函数内细分
                break;
            case MODE_CERVICAL:
                printf("[颈椎牵引模式]\r\n");
                check_adc_and_control(); // 颈椎牵引模式下也用同一控制函数，可在函数内细分
                break;
            case MODE_CUSTOM:
                printf("[自定义高度模式]\r\n");
                // 不自动调整气囊高度，只根据小程序设置的 adc_threshold_flag_arr 控制
                break;
            default:
                break;
        }
        if (control_enable) {
           // printf("pwm_control\r\n");
            control_enable = 0;
            check_adc_and_control();
        }
         // 每5秒上报一次数据
        if (++pub_count >= 50)
        { 
            printf("last_three_bytes: [%d, %d, %d]\r\n", last_three_bytes[0], last_three_bytes[1], last_three_bytes[2]/10);

            int bed_off = (last_three_bytes[0] == 0x01) ? 1 : 0;
            int body_motion = (last_three_bytes[0] == 0x02) ? 1 : 0;
            int32_t heart_rate;
            int32_t respiratory_rate;
            int32_t pose = (gpio_input_state == 1) ? 1 : 2; // 1为仰睡，2为侧睡

            // 使用全局变量 snore

            if (simulatesnore) {
                // 模拟打鼾、心率、呼吸率
                snore = 1;
                last_three_bytes[0] = 0x05;
                heart_rate = (rand() % 11) + 50;         // 50-60之间
                respiratory_rate = (rand() % 11) + 10;   // 10-20之间
                printf("[模拟打鼾] Snore=1, heart_rate=%d, respiratory_rate=%d\r\n", heart_rate, respiratory_rate);
            } else {
                snore = (last_three_bytes[0] == 0x05) ? 1 : 0;
                heart_rate = (int32_t)last_three_bytes[1];
                respiratory_rate = (int32_t)last_three_bytes[2]/10;
            }

            memset(message, 0, sizeof(message)); // 清空消息缓冲区
            sprintf((char*)message,
                "{\"id\":\"%d\",\"version\":\"1.0\",\"params\": {"
                "\"current_mode\": {\"value\": %d}, "
                "\"snore_turn_flag\": {\"value\": %s}, "
                "\"BedOff\": {\"value\": %s}, "
                "\"BodyMotion\": {\"value\": %s}, "
                "\"HeartRate\": {\"value\": %d}, "
                "\"RespiratoryRate\": {\"value\": %d}, "
                "\"sleeppose\": {\"value\": %d}, "
                "\"clock_on\": {\"value\": %s}, "
                "\"Snore\": {\"value\": %s}, "
                "\"simulatesnore\": {\"value\": %s}, "
                "\"height0_adjustment\": {\"value\": %d}, "
                "\"height1_adjustment\": {\"value\": %d}, "
                "\"height2_adjustment\": {\"value\": %d}, "
                "\"height3_adjustment\": {\"value\": %d}}}",
                request_id++,
                (int)current_mode,
                snore_turn_flag ? "true" : "false",
                bed_off ? "true" : "false",
                body_motion ? "true" : "false",
                heart_rate,
                respiratory_rate,
                pose,
                clock_on ? "true" : "false",
                snore ? "true" : "false",
                simulatesnore ? "true" : "false",
                adc_threshold_flag_arr[0],
                adc_threshold_flag_arr[1],
                adc_threshold_flag_arr[2],
                adc_threshold_flag_arr[3]
            );

            printf("Publishing to topic: %s\r\n", pubtopic);
            printf("Message: %s\r\n", message);

            ret = mqtt_publish(&client, pubtopic, (const void*)message, strlen((char*)message), MQTT_PUBLISH_QOS_0); // 发布消息
            if (ret != MQTT_OK) 
            {
                printf("ERROR! mqtt_publish() %s\r\n", mqtt_error_str(client.error));
                if (ret == MQTT_ERROR_SEND_BUFFER_IS_FULL)
                {
                    pub_count = 0;
                    continue;
                }
                break;
            }
            pub_count = 0;
        }

        bflb_mtimer_delay_ms(100); // 延时100ms
    }

    test_close(SHELL_SIGINT); // 关闭socket和任务
    return 0;
}


#ifdef CONFIG_SHELL
#include <shell.h>
extern uint32_t wifi_state; // 外部变量，WiFi连接状态
static int check_wifi_state(void)
{
    if (wifi_state == 1)  // WiFi已连接
        return 0;
    else  // WiFi未连接
        return 1;
}

int cmd_mqtt_pubsub(int argc, const char **argv)
{
    uint32_t ret = 0;
    ret = check_wifi_state(); // 检查WiFi状态
    if (ret != 0) 
    {
        printf("your wifi not connected!\r\n"); // 未连接提示
        return 0;
    }
    example_mqtt(argc, argv); // 启动主流程
    return 0;
}

SHELL_CMD_EXPORT_ALIAS(cmd_mqtt_pubsub, mqtt_pubsub, mqtt pubsub); // 注册shell命令
#endif