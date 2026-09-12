import math

import torch
import torch.nn as nn
import torch.nn.functional as F


class SinusoidalPositionalEncoding(nn.Module):
    def __init__(self, d_model, max_len=5000):
        super(SinusoidalPositionalEncoding, self).__init__()

        # Create a long matrix of sines and cosines
        pe = torch.zeros(max_len, d_model)
        position = torch.arange(0, max_len, dtype=torch.float).unsqueeze(1)
        div_term = torch.exp(torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model))

        pe[:, 0::2] = torch.sin(position * div_term)
        pe[:, 1::2] = torch.cos(position * div_term)

        # Shape: [1, max_len, d_model] so it easily broadcasts with your batch
        pe = pe.unsqueeze(0)

        # Register as a buffer so it saves with the model but isn't updated by backprop
        self.register_buffer('pe', pe)

    def forward(self, x):
        """
        Args:
            x: Tensor, shape [Batch, Seq_Len, d_model]
        """
        seq_len = x.size(1)
        # Add the positional encoding to the input sequence
        x = x + self.pe[:, :seq_len, :]
        return x


class WaveLayer(nn.Module):
    def __init__(self, in_channels, kernel_size, dilation):
        super(WaveLayer, self).__init__()
        self.padding = (kernel_size - 1) * dilation
        self.conv = nn.Conv1d(
            in_channels,
            in_channels,
            kernel_size,
            padding=0,
            dilation=dilation,
        )
        self.tanh = nn.Tanh()
        self.sig = nn.Sigmoid()
        self.filter = nn.Conv1d(in_channels, in_channels, 1)
        self.gate = nn.Conv1d(in_channels, in_channels, 1)
        self.conv2 = nn.Conv1d(in_channels, in_channels, 1)

        # Initialize weights
        torch.nn.init.xavier_uniform_(self.conv.weight, gain=1.0)
        torch.nn.init.xavier_uniform_(self.filter.weight, gain=1.0)
        torch.nn.init.xavier_uniform_(self.gate.weight, gain=1.0)
        torch.nn.init.xavier_uniform_(self.conv2.weight, gain=1.0)

    # self.skip = nn.Conv1d(out_channels, in_channels, 1)
    # self.residual = nn.Conv1d(out_channels, in_channels, 1)

    def forward(self, x):
        x_padded = F.pad(x, (self.padding, 0))
        output = self.conv(x_padded)
        filter = self.filter(output)
        gate = self.gate(output)
        z = self.tanh(filter) * self.sig(gate)
        z = self.conv2(z)
        x = x + z
        return x


class WaveBlock(nn.Module):
    def __init__(self, in_channels, out_channels, kernel_size, dilation_rates):
        super(WaveBlock, self).__init__()
        self.layers = nn.ModuleList()
        dilations = [2**i for i in range(dilation_rates)]
        self.conv1d = nn.Conv1d(in_channels, out_channels, 1)
        for dilation in dilations:
            self.layers.append(WaveLayer(out_channels, kernel_size, dilation))
        torch.nn.init.xavier_uniform_(self.conv1d.weight, gain=1.0)

    def forward(self, x):
        x = self.conv1d(x)
        for layer in self.layers:
            x = layer(x)
        return x


class MFFMBlock(nn.Module):
    def __init__(self, in_channels):
        super(MFFMBlock, self).__init__()
        self.conv1 = nn.Conv1d(
            in_channels=in_channels, out_channels=8, kernel_size=5, padding=2
        )
        # self.bn1 = nn.BatchNorm1d(8)
        self.bn1 = nn.GroupNorm(num_groups=4, num_channels=8)
        self.conv2 = nn.Conv1d(
            in_channels=in_channels + 8, out_channels=16, kernel_size=5, padding=2
        )
        # self.bn2 = nn.BatchNorm1d(16)
        self.bn2 = nn.GroupNorm(num_groups=4, num_channels=16)

        nn.init.xavier_uniform_(self.conv1.weight)
        nn.init.xavier_uniform_(self.conv2.weight)

    def forward(self, input):
        x1 = F.relu(self.bn1(self.conv1(input)))
        x1 = torch.cat((x1, input), dim=1)
        x2 = F.relu(self.bn2(self.conv2(x1)))
        return torch.cat((x2, x1), dim=1)


class NeuroGate(nn.Module):
    def __init__(self, n_chans=22):
        super(NeuroGate, self).__init__()
        self.mffm_block1 = MFFMBlock(n_chans)
        self.wave_block1 = WaveBlock(n_chans, n_chans + 24, 3, 8)
        self.mffm_block2 = MFFMBlock(20)
        self.wave_block2 = WaveBlock(20, 20 + 24, 3, 8)
        self.mffm_block3 = MFFMBlock(20)
        self.conv1 = nn.Conv1d(
            in_channels=n_chans + 24, out_channels=20, kernel_size=3, padding=1
        )
        self.conv2 = nn.Conv1d(
            in_channels=20 + 24, out_channels=20, kernel_size=3, padding=1
        )
        # self.bn1 = nn.BatchNorm1d(20)
        self.bn1 = nn.GroupNorm(num_groups=4, num_channels=20)
        self.conv3 = nn.Conv1d(
            in_channels=20 + 24, out_channels=20, kernel_size=3, padding=1
        )
        # self.bn2 = nn.BatchNorm1d(20)
        # self.bn3 = nn.BatchNorm1d(20)
        self.bn2 = nn.GroupNorm(num_groups=4, num_channels=20)
        self.bn3 = nn.GroupNorm(num_groups=4, num_channels=20)
        self.pos_encoder = SinusoidalPositionalEncoding(d_model=20, max_len=3000)
        self.cls_token = nn.Parameter(torch.randn(1, 1, 20))
        self.encoder = nn.TransformerEncoder(
            nn.TransformerEncoderLayer(20, 4, dropout=0.5, batch_first=True), 2
        )

        self.fc = nn.Linear(20, 2)

        nn.init.xavier_uniform_(self.conv1.weight)
        nn.init.xavier_uniform_(self.conv2.weight)
        nn.init.xavier_uniform_(self.conv3.weight)
        nn.init.xavier_uniform_(self.fc.weight)


    def forward(self, x):
        x1 = self.mffm_block1(x)
        x2 = self.wave_block1(x)
        x = x1 + x2

        # Apply spatial dropout
        x = F.dropout1d(x, 0.5, training=self.training)
        x = F.max_pool1d(x, kernel_size=5, stride=5)

        x = F.relu(self.bn1(self.conv1(x)))

        x1 = self.mffm_block2(x)
        x2 = self.wave_block2(x)
        x = x1 + x2

        x = F.relu(self.bn2(self.conv2(x)))

        x = self.mffm_block3(x)
        x = F.max_pool1d(x, kernel_size=5, stride=5)

        x = F.relu(self.bn3(self.conv3(x)))

        x = x.permute(0, 2, 1)

        batch_size = x.size(0)
        cls_tokens = self.cls_token.expand(batch_size, -1, -1)
        x = torch.cat((cls_tokens, x), dim=1)
        x = self.pos_encoder(x)
        x = self.encoder(x)
        x = x[:, 0, :]

        x = self.fc(x)
        return x



