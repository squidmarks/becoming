#!/usr/bin/env python3
"""
Test BLE connection WITHOUT sending any configuration commands
Just like the iPhone app - connect and listen
"""
import asyncio
from bleak import BleakClient

DEVICE_ADDRESS = "DC:14:25:EE:AA:A4"
DATA_CHAR = "0000ffe4-0000-1000-8000-00805f9a34fb"

async def test_raw_connection():
    print(f"Connecting to {DEVICE_ADDRESS}...")
    
    async with BleakClient(DEVICE_ADDRESS, timeout=20.0) as client:
        print(f"✓ Connected!")
        
        # DON'T send any config commands - just listen
        print("Starting notifications (NO config commands sent)...")
        
        frame_counts = {}
        
        def notification_handler(sender, data):
            hex_str = data.hex()
            
            # Identify frame type
            if len(data) >= 2:
                if data[0] == 0x55:
                    frame_type = data[1]
                    frame_counts[frame_type] = frame_counts.get(frame_type, 0) + 1
                    
                    if frame_type == 0x51:
                        print(f"✓ ACCEL (0x51): {hex_str[:40]}")
                    elif frame_type == 0x52:
                        print(f"✓ GYRO  (0x52): {hex_str[:40]}")
                    elif frame_type == 0x53:
                        print(f"✓✓✓ ANGLE (0x53): {hex_str[:40]} ← SUCCESS!")
                    elif frame_type == 0x54:
                        print(f"✓ MAG   (0x54): {hex_str[:40]}")
                    elif frame_type == 0x61:
                        if frame_counts[frame_type] <= 3:  # Only print first 3
                            print(f"✗ Port  (0x61): {hex_str[:40]}")
                    else:
                        print(f"? Unknown (0x{frame_type:02x}): {hex_str[:40]}")
        
        await client.start_notify(DATA_CHAR, notification_handler)
        
        print("\nListening for 10 seconds...\n")
        await asyncio.sleep(10)
        
        await client.stop_notify(DATA_CHAR)
        
        print(f"\n--- Frame Summary ---")
        for frame_type, count in sorted(frame_counts.items()):
            type_name = {
                0x51: "ACCEL",
                0x52: "GYRO", 
                0x53: "ANGLE ← THIS IS WHAT WE NEED!",
                0x54: "MAG",
                0x61: "Port Status (not useful)"
            }.get(frame_type, f"Unknown (0x{frame_type:02x})")
            print(f"  0x{frame_type:02x}: {count:3d} frames  ({type_name})")

asyncio.run(test_raw_connection())
