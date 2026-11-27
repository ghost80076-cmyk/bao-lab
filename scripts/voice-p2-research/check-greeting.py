"""Compare active PCM of the standalone eSpeak greeting with the source prefix."""
import array
import sys
import wave


def read(path):
    with wave.open(path, "rb") as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getcomptype()) != (1, 2, "NONE"):
            raise ValueError("Expected mono PCM16 eSpeak output")
        pcm = array.array("h")
        pcm.frombytes(wav.readframes(wav.getnframes()))
        if sys.byteorder == "big":
            pcm.byteswap()
        return wav.getframerate(), pcm


source_rate, source = read(sys.argv[1])
greeting_rate, greeting = read(sys.argv[2])
end = len(greeting)
while end and greeting[end - 1] == 0:
    end -= 1
if source_rate != greeting_rate or end < source_rate / 4 or source[:end] != greeting[:end]:
    raise ValueError("Source prefix differs from separately synthesized greeting")
print(f"Source contains standalone greeting through sample {end} at {source_rate} Hz")
