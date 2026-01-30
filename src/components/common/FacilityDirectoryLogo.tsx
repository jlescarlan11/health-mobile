import React from 'react';
import Svg, { Path, Defs, ClipPath, G, Rect } from 'react-native-svg';
import { ViewStyle } from 'react-native';

interface FacilityDirectoryLogoProps {
  width?: number;
  height?: number;
  style?: ViewStyle;
}

export const FacilityDirectoryLogo: React.FC<FacilityDirectoryLogoProps> = ({
  width = 28,
  height = 28,
  style,
}) => {
  return (
    <Svg width={width} height={height} viewBox="25 25 325 325" style={style}>
      <Defs>
        <ClipPath id="4e2bbbc4a3">
          <Path d="M 0 0 L 375 0 L 375 375 L 0 375 Z M 0 0 " clipRule="nonzero" />
        </ClipPath>
        <ClipPath id="c888c93828">
          <Path
            d="M 187.5 0 C 83.945312 0 0 83.945312 0 187.5 C 0 291.054688 83.945312 375 187.5 375 C 291.054688 375 375 291.054688 375 187.5 C 375 83.945312 291.054688 0 187.5 0 Z M 187.5 0 "
            clipRule="nonzero"
          />
        </ClipPath>
        <ClipPath id="7e7cf4fc85">
          <Path d="M 0 0 L 375 0 L 375 375 L 0 375 Z M 0 0 " clipRule="nonzero" />
        </ClipPath>
        <ClipPath id="5928199e27">
          <Path
            d="M 187.5 0 C 83.945312 0 0 83.945312 0 187.5 C 0 291.054688 83.945312 375 187.5 375 C 291.054688 375 375 291.054688 375 187.5 C 375 83.945312 291.054688 0 187.5 0 Z M 187.5 0 "
            clipRule="nonzero"
          />
        </ClipPath>
        <ClipPath id="0aa4df75a4">
          <Rect x="0" width="375" y="0" height="375" />
        </ClipPath>
        <ClipPath id="cba0323842">
          <Path
            d="M 104 67.0625 L 271 67.0625 L 271 308 L 104 308 Z M 104 67.0625 "
            clipRule="nonzero"
          />
        </ClipPath>
        <ClipPath id="8bb1bcf611">
          <Rect x="0" width="375" y="0" height="375" />
        </ClipPath>
      </Defs>
      <G transform="matrix(1, 0, 0, 1, 0, 0)">
        <G clipPath="url(#8bb1bcf611)">
          <G clipPath="url(#4e2bbbc4a3)">
            <G clipPath="url(#c888c93828)">
              <G transform="matrix(1, 0, 0, 1, 0, 0)">
                <G clipPath="url(#0aa4df75a4)">
                  <G clipPath="url(#7e7cf4fc85)">
                    <G clipPath="url(#5928199e27)"></G>
                  </G>
                </G>
              </G>
            </G>
          </G>
          <G clipPath="url(#cba0323842)">
            <Path
              fill="#f5f7f8"
              d="M 187.496094 67.03125 C 141.378906 67.03125 104.003906 104.410156 104.003906 150.523438 C 104.003906 158.195312 105.058594 165.617188 107 172.667969 C 108.679688 178.808594 111.035156 184.675781 114.003906 190.167969 C 114.722656 191.492188 115.480469 192.800781 116.261719 194.085938 L 179.207031 303.113281 C 179.34375 303.347656 179.464844 303.59375 179.613281 303.820312 C 181.34375 306.320312 184.226562 307.953125 187.492188 307.953125 C 190.765625 307.953125 193.65625 306.296875 195.382812 303.789062 L 195.648438 303.324219 L 258.710938 194.105469 L 260.988281 190.160156 C 263.953125 184.671875 266.304688 178.800781 267.992188 172.667969 C 269.925781 165.617188 270.980469 158.195312 270.980469 150.523438 C 270.980469 104.410156 233.605469 67.03125 187.496094 67.03125 Z M 187.492188 185.523438 C 168.152344 185.523438 152.480469 169.851562 152.480469 150.523438 C 152.480469 131.1875 168.148438 115.511719 187.492188 115.511719 C 206.824219 115.511719 222.488281 131.1875 222.488281 150.523438 C 222.488281 169.851562 206.824219 185.523438 187.492188 185.523438 Z M 187.492188 185.523438 "
              fillOpacity="1"
              fillRule="nonzero"
            />
          </G>
        </G>
      </G>
    </Svg>
  );
};
