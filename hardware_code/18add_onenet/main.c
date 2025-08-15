#include "FreeRTOS.h"                         // FreeRTOS主头文件
#include "task.h"                             // FreeRTOS任务管理
#include "timers.h"                           // FreeRTOS定时器
#include "mem.h"                              // 内存管理

#include <lwip/tcpip.h>                       // lwIP TCP/IP协议栈
#include <lwip/sockets.h>                     // lwIP套接字
#include <lwip/netdb.h>                       // lwIP网络数据库

#include "bl_fw_api.h"                        // BL芯片固件API
#include "wifi_mgmr_ext.h"                    // WiFi管理扩展
#include "wifi_mgmr.h"                        // WiFi管理

#include "bflb_irq.h"                         // 中断管理
#include "bflb_uart.h"                        // UART驱动

#include "bl616_glb.h"                        // BL616全局控制
#include "rfparam_adapter.h"                  // 射频参数适配

#include "board.h"                            // 板级初始化
#include "shell.h"                            // shell命令行

#define DBG_TAG "MAIN"                        // 日志标签
#include "log.h"                              // 日志模块


struct bflb_device_s *uartx;

#define WIFI_STACK_SIZE  (1536)               // WiFi任务栈大小
#define TASK_PRIORITY_FW (16)                 // WiFi任务优先级

static struct bflb_device_s *uart0;           // UART0设备指针




static TaskHandle_t wifi_fw_task;             // WiFi固件任务句柄
static wifi_conf_t conf = {
    .country_code = "CN",
};

extern void shell_init_with_task(struct bflb_device_s *shell);

int wifi_start_firmware_task(void)
{
    LOG_I("Starting wifi ...\r\n");

    /* enable wifi clock */
    GLB_PER_Clock_UnGate(GLB_AHB_CLOCK_IP_WIFI_PHY | GLB_AHB_CLOCK_IP_WIFI_MAC_PHY | GLB_AHB_CLOCK_IP_WIFI_PLATFORM);
    GLB_AHB_MCU_Software_Reset(GLB_AHB_MCU_SW_WIFI);

    /* set ble controller EM Size */
    GLB_Set_EM_Sel(GLB_WRAM160KB_EM0KB);

    if (0 != rfparam_init(0, NULL, 0)) {
        LOG_I("PHY RF init failed!\r\n");
        return 0;
    }

    LOG_I("PHY RF init success!\r\n");

    /* Enable wifi irq */
    extern void interrupt0_handler(void);
    bflb_irq_attach(WIFI_IRQn, (irq_callback)interrupt0_handler, NULL);
    bflb_irq_enable(WIFI_IRQn);

    xTaskCreate(wifi_main, (char *)"fw", WIFI_STACK_SIZE, NULL, TASK_PRIORITY_FW, &wifi_fw_task);

    return 0;
}

volatile uint32_t wifi_state = 0;
void wifi_event_handler(uint32_t code)
{
    switch (code) {
        case CODE_WIFI_ON_INIT_DONE: {
            LOG_I("[APP] [EVT] %s, CODE_WIFI_ON_INIT_DONE\r\n", __func__);
            wifi_mgmr_init(&conf);
        } break;
        case CODE_WIFI_ON_MGMR_DONE: {
            LOG_I("[APP] [EVT] %s, CODE_WIFI_ON_MGMR_DONE\r\n", __func__);
        } break;
        case CODE_WIFI_ON_SCAN_DONE: {
            LOG_I("[APP] [EVT] %s, CODE_WIFI_ON_SCAN_DONE\r\n", __func__);
            wifi_mgmr_sta_scanlist();
        } break;
        case CODE_WIFI_ON_CONNECTED: {
            LOG_I("[APP] [EVT] %s, CODE_WIFI_ON_CONNECTED\r\n", __func__);
            void mm_sec_keydump();
            mm_sec_keydump();
        } break;
        case CODE_WIFI_ON_GOT_IP: {
            wifi_state = 1;
            LOG_I("[APP] [EVT] %s, CODE_WIFI_ON_GOT_IP\r\n", __func__);
            LOG_I("[SYS] Memory left is %d Bytes\r\n", kfree_size());
        } break;
        case CODE_WIFI_ON_DISCONNECT: {
            wifi_state = 0;
            LOG_I("[APP] [EVT] %s, CODE_WIFI_ON_DISCONNECT\r\n", __func__);
        } break;
        case CODE_WIFI_ON_AP_STARTED: {
            LOG_I("[APP] [EVT] %s, CODE_WIFI_ON_AP_STARTED\r\n", __func__);
        } break;
        case CODE_WIFI_ON_AP_STOPPED: {
            LOG_I("[APP] [EVT] %s, CODE_WIFI_ON_AP_STOPPED\r\n", __func__);
        } break;
        case CODE_WIFI_ON_AP_STA_ADD: {
            LOG_I("[APP] [EVT] [AP] [ADD] %lld\r\n", xTaskGetTickCount());
        } break;
        case CODE_WIFI_ON_AP_STA_DEL: {
            LOG_I("[APP] [EVT] [AP] [DEL] %lld\r\n", xTaskGetTickCount());
        } break;
        default: {
            LOG_I("[APP] [EVT] Unknown code %u \r\n", code);
        }
    }
}

void check_adc_and_control(void);
int main(void)
{
    board_init();
    printf("board_init done\r\n");
    /*led_init();    // 初始化4个GPIO通道//电磁阀
    printf("led_init done\r\n");
    adc_init();
    printf("adc_init done\r\n");
    uart_init();
    printf("uart_init done\r\n");
    dma_init();
    printf("dma_init done\r\n");
    timer_init();
    printf("timer_init done\r\n");*/


     uart0 = bflb_device_get_by_name("uart0");
     shell_init_with_task(uart0);
 
     tcpip_init(NULL, NULL);
     wifi_start_firmware_task();
 
     vTaskStartScheduler();
 
    
    while (1) {
        check_adc_and_control(); // 0.5秒动作一次
    }
}