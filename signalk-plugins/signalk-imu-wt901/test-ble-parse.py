#!/usr/bin/env python3
"""
Parse WT901BLECL data correctly - ALL data is in one 20-byte packet!
"""
import asyncio
from bleak import BleakClient
import struct

DEVICE_ADDRESS = "DC:14:25:EE:AA:A4"
DATA_CHAR = "0000ffe4-0000-1000-8000-00805f9a34fb"

def parse_wt901_packet(data):
    """Parse WT901BLECL 20-byte data packet"""
    if len(data) < 20:
        return None
    
    # Skip header (bytes 0-1)
    raw_data = data[2:]
    
    # Convert to signed bytes
    signed_bytes = []
    for b in raw_data:
        if b <= 127:
            signed_bytes.append(b)
        else:
            signed_bytes.append((256 - b) * -1)
    
    # Parse acceleration (bytes 0-5 of data, after header)
    ax_raw = (signed_bytes[1] << 8) | (signed_bytes[0] & 0xFF)
    ay_raw = (signed_bytes[3] << 8) | (signed_bytes[2] & 0xFF)
    az_raw = (signed_bytes[5] << 8) | (signed_bytes[4] & 0xFF)
    
    ax = (ax_raw / 32768.0) * (16 * 9.8)  # m/s²
    ay = (ay_raw / 32768.0) * (16 * 9.8)
    az = (az_raw / 32768.0) * (16 * 9.8)
    
    # Parse angular velocity (bytes 6-11)
    wx_raw = (signed_bytes[7] << 8) | (signed_bytes[6] & 0xFF)
    wy_raw = (signed_bytes[9] << 8) | (signed_bytes[8] & 0xFF)
    wz_raw = (signed_bytes[11] << 8) | (signed_bytes[10] & 0xFF)
    
    wx = (wx_raw / 32768.0) * 2000  # deg/s
    wy = (wy_raw / 32768.0) * 2000
    wz = (wz_raw / 32768.0) * 2000
    
    # Parse angles (bytes 12-17) - THIS IS WHAT WE NEED!
    roll_raw = (signed_bytes[13] << 8) | (signed_bytes[12] & 0xFF)
    pitch_raw = (signed_bytes[15] << 8) | (signed_bytes[14] & 0xFF)
    yaw_raw = (signed_bytes[17] << 8) | (signed_bytes[16] & 0xFF)
    
    roll = (roll_raw / 32768.0) * 180  # degrees
    pitch = (pitch_raw / 32768.0) * 180
    yaw = (yaw_raw / 32768.0) * 180
    
    return {
        'accel': (ax, ay, az),
        'gyro': (wx, wy, wz),
        'angles': (roll, pitch, yaw)
    }

async def test_parsing():
    print(f"Connecting to {DEVICE_ADDRESS}...")
    
    async with BleakClient(DEVICE_ADDRESS, timeout=20.0) as client:
        print(f"✓ Connected!\n")
        
        count = 0
        
        def notification_handler(sender, data):
            nonlocal count
            count += 1
            
            result = parse_wt901_packet(data)
            if result:
                ax, ay, az = result['accel']
                wx, wy, wz = result['gyro']
                roll, pitch, yaw = result['angles']
                
                if count % 10 == 1:  # Print every 10th packet
                    print(f"\n--- Packet #{count} ---")
                    print(f"Accel:  X={ax:7.2f} Y={ay:7.2f} Z={az:7.2f} m/s²")
                    print(f"Gyro:   X={wx:7.2f} Y={wy:7.2f} Z={wz:7.2f} °/s")
                    print(f"Angles: Roll={roll:7.2f}° Pitch={pitch:7.2f}° Yaw={yaw:7.2f}°")
        
        await client.start_notify(DATA_CHAR, notification_handler)
        
        print("Listening for 10 seconds...\n")
        await asyncio.sleep(10)
        
        await client.stop_notify(DATA_CHAR)
        
        print(f"\n✓ Received and parsed {count} packets successfully!")

asyncio.run(test_parsing())
