#!/usr/bin/env python3
"""
Read WT901BLECL configuration
"""
import asyncio
from bleak import BleakClient

DEVICE_ADDRESS = "DC:14:25:EE:AA:A4"
WRITE_CHAR = "0000ffe9-0000-1000-8000-00805f9a34fb"
READ_CHAR = "0000ffe4-0000-1000-8000-00805f9a34fb"

async def read_config():
    """Read sensor configuration"""
    print(f"Connecting to {DEVICE_ADDRESS}...")
    
    async with BleakClient(DEVICE_ADDRESS, timeout=20.0) as client:
        print(f"✓ Connected")
        
        # Set up notification handler for responses
        responses = []
        
        def notification_handler(sender, data):
            responses.append(data)
            print(f"Response: {data.hex()}")
        
        await client.start_notify(READ_CHAR, notification_handler)
        
        # Unlock
        print("\n1. Unlocking...")
        await client.write_gatt_char(WRITE_CHAR, bytes([0xFF, 0xAA, 0x69, 0x88, 0xB5]))
        await asyncio.sleep(0.5)
        
        # Read RSW register (output content configuration)
        print("2. Reading RSW register (0x02)...")
        await client.write_gatt_char(WRITE_CHAR, bytes([0xFF, 0xAA, 0x27, 0x02, 0x00]))
        await asyncio.sleep(0.5)
        
        # Read output rate register
        print("3. Reading output rate register (0x03)...")
        await client.write_gatt_char(WRITE_CHAR, bytes([0xFF, 0xAA, 0x27, 0x03, 0x00]))
        await asyncio.sleep(0.5)
        
        # Read algorithm register
        print("4. Reading algorithm register (0x24)...")
        await client.write_gatt_char(WRITE_CHAR, bytes([0xFF, 0xAA, 0x27, 0x24, 0x00]))
        await asyncio.sleep(0.5)
        
        await client.stop_notify(READ_CHAR)
        
        print(f"\n✓ Received {len(responses)} responses")
        for i, resp in enumerate(responses, 1):
            print(f"  Response {i}: {resp.hex()}")

asyncio.run(read_config())
